import { eq, desc, and } from 'drizzle-orm'
import { getDatabase } from '../client'
import { sessions, messages, type SessionRow, type MessageRow } from '../schema'
import type { Runner } from '../../../shared/runners'

// 与前端兼容的类型定义
export interface LogEntry {
  id: string
  stream: 'stdout' | 'stderr'
  text: string
  timestamp?: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 执行追踪标识 */
  traceId?: string
  status?: 'running' | 'success' | 'error'
  logs?: LogEntry[]
  output?: string
  errorMessage?: string
  sessionId?: string
  startedAt?: number
  runner?: string
}

export type RunnerContextMap = Partial<Record<Runner, string>>

export interface Session {
  id: string
  title: string
  messages: Message[]
  runnerContexts?: RunnerContextMap
  /** 是否已归档 */
  archived?: boolean
  createdAt?: string
  updatedAt?: string
}

/**
 * 将数据库行转换为 Session 对象
 */
function rowToSession(row: SessionRow, messageRows: MessageRow[]): Session {
  return {
    id: row.id,
    title: row.title,
    messages: messageRows.map(rowToMessage),
    runnerContexts: row.runnerContexts ? JSON.parse(row.runnerContexts) : undefined,
    archived: row.archived ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

/**
 * 将数据库行转换为 Message 对象
 */
function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    traceId: row.traceId ?? undefined,
    status: row.status as 'running' | 'success' | 'error' | undefined,
    logs: row.logs ? JSON.parse(row.logs) : undefined,
    output: row.output ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    sessionId: row.sessionId,
    startedAt: row.startedAt ?? undefined,
    runner: row.runner ?? undefined
  }
}

/**
 * 获取项目的所有会话
 */
export async function listSessions(
  projectId: string,
  options?: { includeArchived?: boolean }
): Promise<Session[]> {
  const db = getDatabase()
  const includeArchived = options?.includeArchived ?? false

  // 构建查询条件
  const whereCondition = includeArchived
    ? eq(sessions.projectId, projectId)
    : and(eq(sessions.projectId, projectId), eq(sessions.archived, false))

  const sessionRows = await db
    .select()
    .from(sessions)
    .where(whereCondition)
    .orderBy(desc(sessions.updatedAt))

  // 批量获取所有消息
  const sessionIds = sessionRows.map((s) => s.id)
  if (sessionIds.length === 0) return []

  const allMessages = await db
    .select()
    .from(messages)
    .where(
      sessionIds.length === 1
        ? eq(messages.sessionId, sessionIds[0])
        : // 使用 inArray 会更好，但简单起见先用这个方式
          eq(messages.sessionId, messages.sessionId) // 占位，实际应该用 inArray
    )
    .orderBy(messages.createdAt)

  // 按 sessionId 分组消息
  const messagesBySession = new Map<string, MessageRow[]>()
  for (const msg of allMessages) {
    const list = messagesBySession.get(msg.sessionId) || []
    list.push(msg)
    messagesBySession.set(msg.sessionId, list)
  }

  return sessionRows.map((row) => rowToSession(row, messagesBySession.get(row.id) || []))
}

/**
 * 获取单个会话
 */
export async function getSession(projectId: string, sessionId: string): Promise<Session | null> {
  const db = getDatabase()

  const [sessionRow] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)

  if (!sessionRow || sessionRow.projectId !== projectId) return null

  const messageRows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(messages.createdAt)

  return rowToSession(sessionRow, messageRows)
}

/**
 * 创建新会话
 */
export async function createSession(projectId: string, title?: string): Promise<Session> {
  const db = getDatabase()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const newSession = {
    id,
    projectId,
    title: title || `会话 ${new Date().toLocaleString('zh-CN')}`,
    runnerContexts: null,
    createdAt: now,
    updatedAt: now
  }

  await db.insert(sessions).values(newSession)

  return {
    id: newSession.id,
    title: newSession.title,
    messages: [],
    createdAt: newSession.createdAt,
    updatedAt: newSession.updatedAt
  }
}

/**
 * 更新会话
 */
export async function updateSession(
  projectId: string,
  sessionId: string,
  data: { title?: string; runnerContexts?: RunnerContextMap; archived?: boolean }
): Promise<Session | null> {
  const db = getDatabase()
  const now = new Date().toISOString()

  const updateData: Partial<typeof sessions.$inferInsert> = {
    updatedAt: now
  }

  if (data.title !== undefined) {
    updateData.title = data.title
  }
  if (data.runnerContexts !== undefined) {
    updateData.runnerContexts = JSON.stringify(data.runnerContexts)
  }
  if (data.archived !== undefined) {
    updateData.archived = data.archived
  }

  await db.update(sessions).set(updateData).where(eq(sessions.id, sessionId))

  return getSession(projectId, sessionId)
}

/**
 * 删除会话
 */
export async function deleteSession(projectId: string, sessionId: string): Promise<void> {
  const db = getDatabase()

  // 先验证会话属于该项目
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)

  if (session && session.projectId === projectId) {
    // CASCADE 会自动删除关联的消息
    await db.delete(sessions).where(eq(sessions.id, sessionId))
  }
}

/**
 * 追加消息到会话
 */
export async function appendMessages(
  projectId: string,
  sessionId: string,
  newMessages: Message[]
): Promise<Session | null> {
  const db = getDatabase()
  const now = new Date().toISOString()

  // 验证会话存在且属于该项目
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  if (!session || session.projectId !== projectId) return null

  // 插入消息
  for (const msg of newMessages) {
    await db.insert(messages).values({
      id: msg.id,
      sessionId,
      role: msg.role,
      content: msg.content,
      traceId: msg.traceId ?? null,
      status: msg.status ?? null,
      logs: msg.logs ? JSON.stringify(msg.logs) : null,
      output: msg.output ?? null,
      errorMessage: msg.errorMessage ?? null,
      startedAt: msg.startedAt ?? null,
      runner: msg.runner ?? null,
      createdAt: now
    })
  }

  // 更新会话的 updatedAt
  await db.update(sessions).set({ updatedAt: now }).where(eq(sessions.id, sessionId))

  return getSession(projectId, sessionId)
}

/**
 * 更新单条消息
 */
export async function updateMessage(
  projectId: string,
  sessionId: string,
  messageId: string,
  patch: Partial<Message>
): Promise<void> {
  const db = getDatabase()
  const now = new Date().toISOString()

  // 验证会话存在且属于该项目
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  if (!session || session.projectId !== projectId) return

  const updateData: Partial<typeof messages.$inferInsert> = {}

  if (patch.content !== undefined) updateData.content = patch.content
  if (patch.status !== undefined) updateData.status = patch.status
  if (patch.logs !== undefined) updateData.logs = JSON.stringify(patch.logs)
  if (patch.output !== undefined) updateData.output = patch.output
  if (patch.errorMessage !== undefined) updateData.errorMessage = patch.errorMessage
  if (patch.startedAt !== undefined) updateData.startedAt = patch.startedAt
  if (patch.runner !== undefined) updateData.runner = patch.runner

  if (Object.keys(updateData).length > 0) {
    await db.update(messages).set(updateData).where(eq(messages.id, messageId))

    // 更新会话的 updatedAt
    await db.update(sessions).set({ updatedAt: now }).where(eq(sessions.id, sessionId))
  }
}
