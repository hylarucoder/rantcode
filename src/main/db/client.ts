import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { createClient, Client } from '@libsql/client'
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as schema from './schema'
import { getDbPath as getDbPathFromPaths, getConfigRoot } from '../paths'
import { cleanupStaleRunningMessages } from './repositories/session'

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

  // 清理遗留的 running 状态消息
  // 应用启动时，之前运行的任务不可能还在运行
  await cleanupStaleRunningMessages()

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

  try {
    await migrate(db, { migrationsFolder })
    console.log('[DB] Migrations completed successfully')
  } catch (err) {
    console.error('[DB] Migration failed:', err)
    throw err
  }
}
