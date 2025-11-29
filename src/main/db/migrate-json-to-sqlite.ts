/**
 * 数据迁移脚本：从 JSON 文件迁移到 SQLite
 *
 * 这个脚本会在应用启动时检查是否需要迁移旧数据。
 * 迁移完成后会在数据库中记录迁移状态，避免重复迁移。
 */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { eq } from 'drizzle-orm'
import { getDatabase, getClient } from './client'
import { sessions, messages } from './schema'
import { loggerService } from '../services/loggerService'
import { getSessionsDir as getSessionsDirFromPaths } from '../paths'
import { humanizeDuration } from '../../shared/utils/humanize'

const log = loggerService.child('db.migration')

interface LegacyLogEntry {
  id: string
  stream: 'stdout' | 'stderr'
  text: string
  timestamp?: number
}

interface LegacyMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  jobId?: string
  status?: 'running' | 'success' | 'error'
  logs?: LegacyLogEntry[]
  output?: string
  errorMessage?: string
  sessionId?: string
  startedAt?: number
  runner?: string
}

interface LegacySession {
  id: string
  title: string
  messages: LegacyMessage[]
  runnerContexts?: Record<string, string>
  createdAt?: string
  updatedAt?: string
}

/**
 * 获取 sessions 目录路径
 */
function getSessionsDir(): string {
  return getSessionsDirFromPaths()
}

/**
 * 检查是否已经完成迁移
 */
async function isMigrationDone(): Promise<boolean> {
  const client = getClient()

  // 使用 user_version pragma 的高位来标记迁移状态
  // version 1 = schema created, version 2+ = migration done
  const result = await client.execute('PRAGMA user_version')
  const version = (result.rows[0]?.user_version as number) ?? 0
  return version >= 2
}

/**
 * 标记迁移完成
 */
async function markMigrationDone(): Promise<void> {
  const client = getClient()
  await client.execute('PRAGMA user_version = 2')
}

/**
 * 读取旧的 JSON session 文件
 */
async function readLegacySessions(projectId: string): Promise<LegacySession[]> {
  const sessionsDir = getSessionsDir()
  const file = path.join(sessionsDir, `${projectId}.json`)

  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as LegacySession[]
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return []
    }
    throw err
  }
}

/**
 * 获取所有项目的 session 文件
 */
async function getAllLegacyProjectIds(): Promise<string[]> {
  const sessionsDir = getSessionsDir()

  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name.replace(/\.json$/, ''))
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return []
    }
    throw err
  }
}

/**
 * 迁移单个项目的 sessions
 */
async function migrateProjectSessions(projectId: string): Promise<number> {
  const db = getDatabase()
  const legacySessions = await readLegacySessions(projectId)

  if (legacySessions.length === 0) {
    return 0
  }

  let migratedCount = 0

  for (const session of legacySessions) {
    // 检查是否已存在
    const existing = await db.select().from(sessions).where(eq(sessions.id, session.id)).limit(1)
    if (existing.length > 0) {
      continue
    }

    const now = new Date().toISOString()

    // 插入 session
    await db.insert(sessions).values({
      id: session.id,
      projectId,
      title: session.title,
      runnerContexts: session.runnerContexts ? JSON.stringify(session.runnerContexts) : null,
      createdAt: session.createdAt || now,
      updatedAt: session.updatedAt || now
    })

    // 插入 messages
    for (const msg of session.messages) {
      await db.insert(messages).values({
        id: msg.id,
        sessionId: session.id,
        role: msg.role,
        content: msg.content,
        // 旧数据使用 jobId，迁移到新字段 traceId
        traceId: msg.jobId ?? null,
        status: msg.status ?? null,
        logs: msg.logs ? JSON.stringify(msg.logs) : null,
        output: msg.output ?? null,
        errorMessage: msg.errorMessage ?? null,
        startedAt: msg.startedAt ?? null,
        runner: msg.runner ?? null,
        createdAt: now
      })
    }

    migratedCount++
  }

  return migratedCount
}

/**
 * 执行完整的数据迁移
 */
export async function runDataMigration(): Promise<void> {
  const t0 = Date.now()

  // 检查是否已完成迁移
  if (await isMigrationDone()) {
    log.debug('migration already completed, skipping')
    return
  }

  log.info('starting JSON to SQLite migration')

  try {
    const projectIds = await getAllLegacyProjectIds()

    if (projectIds.length === 0) {
      log.info('no legacy session files found')
      await markMigrationDone()
      return
    }

    let totalMigrated = 0

    for (const projectId of projectIds) {
      const count = await migrateProjectSessions(projectId)
      if (count > 0) {
        log.info(`migrated ${count} sessions for project ${projectId}`)
        totalMigrated += count
      }
    }

    await markMigrationDone()

    const dt = Date.now() - t0
    log.info(`migration completed: ${totalMigrated} sessions migrated in ${humanizeDuration(dt)}`)
  } catch (err) {
    const msg = (err as { message?: string })?.message || 'unknown error'
    log.error(`migration failed: ${msg}`)
    throw err
  }
}
