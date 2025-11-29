import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { createClient, Client } from '@libsql/client'
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as schema from './schema'
import { getDbPath as getDbPathFromPaths, getConfigRoot } from '../paths'

let db: LibSQLDatabase<typeof schema> | null = null
let client: Client | null = null

/**
 * 获取数据库文件路径
 */
export function getDbPath(): string {
  return getDbPathFromPaths()
}

/**
 * 初始化数据库连接
 *
 * 应在 app ready 之后调用
 */
export async function initDatabase(): Promise<LibSQLDatabase<typeof schema>> {
  if (db) return db

  // 确保配置目录存在
  const configRoot = getConfigRoot()
  fs.mkdirSync(configRoot, { recursive: true })

  const dbPath = getDbPath()
  console.log('[DB] Initializing database at:', dbPath)

  client = createClient({
    url: `file:${dbPath}`
  })

  // 启用 WAL 模式提升并发性能
  await client.execute('PRAGMA journal_mode = WAL')

  db = drizzle(client, { schema })

  // 运行迁移（如果需要）
  await runMigrations()

  console.log('[DB] Database initialized successfully')
  return db
}

/**
 * 获取数据库实例
 */
export function getDatabase(): LibSQLDatabase<typeof schema> {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

/**
 * 获取底层 libsql client 实例
 */
export function getClient(): Client {
  if (!client) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return client
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (client) {
    client.close()
    client = null
    db = null
    console.log('[DB] Database closed')
  }
}

/**
 * 获取迁移文件夹路径
 *
 * resources/migrations 在开发和打包后都能正确访问
 */
function getMigrationsFolder(): string {
  if (app.isPackaged) {
    // 打包后：resources 目录在 process.resourcesPath
    return path.join(process.resourcesPath, 'migrations')
  }
  // 开发模式：从项目根目录的 resources 读取
  return path.join(app.getAppPath(), 'resources', 'migrations')
}

/**
 * 检查表是否存在指定列
 */
async function hasColumn(tableName: string, columnName: string): Promise<boolean> {
  if (!client) return false
  const result = await client.execute(`PRAGMA table_info(${tableName})`)
  return result.rows.some((row) => row.name === columnName)
}

/**
 * 检查是否是旧版数据库（有表但没有 drizzle 迁移记录）
 */
async function isLegacyDatabase(): Promise<boolean> {
  if (!client) return false

  // 检查是否有 sessions 表
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
  )
  if (tables.rows.length === 0) return false

  // 检查是否有 drizzle 迁移记录表
  const drizzleTables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
  )

  // 有 sessions 表但没有 drizzle 迁移记录，说明是旧版数据库
  return drizzleTables.rows.length === 0
}

/**
 * 修复旧版数据库的表结构
 *
 * 将旧列名重命名为新列名，使其与当前 schema 一致
 */
async function fixLegacySchema(): Promise<void> {
  if (!client) return

  console.log('[DB] Fixing legacy database schema')

  // 修复 messages 表：job_id -> trace_id
  if ((await hasColumn('messages', 'job_id')) && !(await hasColumn('messages', 'trace_id'))) {
    console.log('[DB] Renaming messages.job_id to trace_id')
    await client.execute('ALTER TABLE messages RENAME COLUMN job_id TO trace_id;')
  }

  // 修复 sessions 表：runner_sessions -> runner_contexts
  if (
    (await hasColumn('sessions', 'runner_sessions')) &&
    !(await hasColumn('sessions', 'runner_contexts'))
  ) {
    console.log('[DB] Renaming sessions.runner_sessions to runner_contexts')
    await client.execute('ALTER TABLE sessions RENAME COLUMN runner_sessions TO runner_contexts;')
  }

  console.log('[DB] Legacy schema fixed')
}

/**
 * 标记旧版数据库为已迁移
 *
 * 创建 drizzle 迁移记录表并插入初始迁移记录，
 * 让 drizzle migrate 认为初始迁移已执行
 */
async function markLegacyAsMigrated(): Promise<void> {
  if (!client) return

  console.log('[DB] Marking legacy database as migrated')

  // 先修复表结构
  await fixLegacySchema()

  // 创建迁移记录表
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER
    );
  `)

  // 读取初始迁移的 hash（从 journal 文件）
  const migrationsFolder = getMigrationsFolder()
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json')

  if (fs.existsSync(journalPath)) {
    try {
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
      const entries = journal.entries || []

      // 插入所有迁移记录（跳过已存在的）
      for (const entry of entries) {
        await client.execute({
          sql: 'INSERT OR IGNORE INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)',
          args: [entry.tag, Date.now()]
        })
        console.log('[DB] Marked migration as completed:', entry.tag)
      }
    } catch (err) {
      console.error('[DB] Failed to read migration journal:', err)
    }
  }
}

/**
 * 执行数据库迁移
 *
 * 使用 drizzle-kit 生成的迁移文件
 */
async function runMigrations(): Promise<void> {
  if (!db) return

  const migrationsFolder = getMigrationsFolder()
  console.log('[DB] Running migrations from:', migrationsFolder)

  // 检查迁移文件夹是否存在
  if (!fs.existsSync(migrationsFolder)) {
    console.log('[DB] No migrations folder found, skipping migrations')
    return
  }

  // 处理旧版数据库：如果表已存在但没有迁移记录，标记为已迁移
  if (await isLegacyDatabase()) {
    console.log('[DB] Detected legacy database, marking as migrated')
    await markLegacyAsMigrated()
  } else {
    // 即使不是旧版数据库，也检查并修复可能的列名问题
    // （处理之前标记了迁移但没修复结构的情况）
    await fixLegacySchema()
  }

  try {
    await migrate(db, { migrationsFolder })
    console.log('[DB] Migrations completed successfully')
  } catch (err) {
    console.error('[DB] Migration failed:', err)
    throw err
  }
}
