/**
 * 基于 SQLite + Drizzle ORM 的 Session 服务
 *
 * 提供与 FileSessionService 相同的 API 接口，用于 oRPC 调用
 */
import * as repo from '../repositories/session'
import { loggerService } from '../../services/loggerService'
import type { z } from 'zod'
import type {
  sessionSchema,
  messageSchema,
  createSessionInputSchema,
  updateSessionInputSchema,
  deleteSessionInputSchema,
  appendMessagesInputSchema,
  updateMessageInputSchema,
  listSessionsInputSchema,
  getSessionInputSchema
} from '../../../shared/orpc/schemas'
import { RUNNER_VALUES } from '../../../shared/runners'

// 有效的 runner 值集合
const VALID_RUNNERS = new Set<string>(RUNNER_VALUES)

// 类型定义（与 oRPC schema 对齐）
export type SessionOutput = z.infer<typeof sessionSchema>
export type MessageOutput = z.infer<typeof messageSchema>
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>
export type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>
export type DeleteSessionInput = z.infer<typeof deleteSessionInputSchema>
export type AppendMessagesInput = z.infer<typeof appendMessagesInputSchema>
export type UpdateMessageInput = z.infer<typeof updateMessageInputSchema>
export type ListSessionsInput = z.infer<typeof listSessionsInputSchema>
export type GetSessionInput = z.infer<typeof getSessionInputSchema>

// 日志结果类型
export interface LogsResult {
  logs: repo.LogEntry[]
  total: number
  hasMore: boolean
}

const log = loggerService.child('sessions.db')

/**
 * SQLite 版本的 Session 服务
 */
export class DbSessionService {
  /**
   * 列出项目的所有 session
   */
  async list(input: ListSessionsInput): Promise<SessionOutput[]> {
    const t0 = Date.now()
    const sessions = await repo.listSessions(input.projectId, {
      includeArchived: input.includeArchived
    })

    log.debug('sessions.list completed', {
      projectId: input.projectId,
      count: sessions.length,
      includeArchived: input.includeArchived,
      durationMs: Date.now() - t0
    })

    return sessions.map((s) => this.toSessionOutput(s))
  }

  /**
   * 获取单个 session
   */
  async get(input: GetSessionInput): Promise<SessionOutput | null> {
    const session = await repo.getSession(input.projectId, input.sessionId)
    if (!session) {
      return null
    }
    return this.toSessionOutput(session)
  }

  /**
   * 创建新 session
   */
  async create(input: CreateSessionInput): Promise<SessionOutput> {
    const session = await repo.createSession(input.projectId, input.title)
    log.info('session created', { id: session.id, projectId: input.projectId })
    return this.toSessionOutput(session)
  }

  /**
   * 更新 session
   */
  async update(input: UpdateSessionInput): Promise<SessionOutput> {
    const session = await repo.updateSession(input.projectId, input.sessionId, {
      title: input.title,
      runnerContexts: input.runnerContexts,
      archived: input.archived
    })
    if (!session) {
      throw new Error('Session not found')
    }
    log.info('session updated', {
      id: input.sessionId,
      projectId: input.projectId,
      title: input.title,
      archived: input.archived
    })
    return this.toSessionOutput(session)
  }

  /**
   * 删除 session
   */
  async delete(input: DeleteSessionInput): Promise<{ ok: boolean }> {
    await repo.deleteSession(input.projectId, input.sessionId)
    log.info('session deleted', { id: input.sessionId, projectId: input.projectId })
    return { ok: true }
  }

  /**
   * 追加消息
   */
  async appendMessages(input: AppendMessagesInput): Promise<SessionOutput> {
    const messages: repo.Message[] = input.messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      traceId: msg.traceId,
      status: msg.status,
      logs: msg.logs as repo.LogEntry[] | undefined,
      output: msg.output,
      errorMessage: msg.errorMessage,
      startedAt: msg.startedAt,
      runner: msg.runner
    }))

    const session = await repo.appendMessages(input.projectId, input.sessionId, messages)
    if (!session) {
      throw new Error('Session not found')
    }
    return this.toSessionOutput(session)
  }

  /**
   * 更新单条消息
   */
  async updateMessage(input: UpdateMessageInput): Promise<SessionOutput> {
    const patch: Partial<repo.Message> = {}
    if (input.patch.content !== undefined) patch.content = input.patch.content
    if (input.patch.status !== undefined) patch.status = input.patch.status
    if (input.patch.logs !== undefined) patch.logs = input.patch.logs as repo.LogEntry[]
    if (input.patch.output !== undefined) patch.output = input.patch.output
    if (input.patch.errorMessage !== undefined) patch.errorMessage = input.patch.errorMessage
    if (input.patch.startedAt !== undefined) patch.startedAt = input.patch.startedAt
    if (input.patch.runner !== undefined) patch.runner = input.patch.runner

    await repo.updateMessage(input.projectId, input.sessionId, input.messageId, patch)

    const session = await repo.getSession(input.projectId, input.sessionId)
    if (!session) {
      throw new Error('Session or message not found')
    }
    return this.toSessionOutput(session)
  }

  // ========== 日志相关 API（兼容 FileSessionService 接口）==========

  /**
   * 获取消息的日志（从 messages 表的 logs 字段读取）
   */
  async getMessageLogs(input: {
    projectId: string
    sessionId: string
    traceId: string
    offset?: number
    limit?: number
  }): Promise<LogsResult> {
    const session = await repo.getSession(input.projectId, input.sessionId)
    if (!session) {
      return { logs: [], total: 0, hasMore: false }
    }

    // 找到对应 traceId 的消息
    const message = session.messages.find((m) => m.traceId === input.traceId)
    if (!message || !message.logs) {
      return { logs: [], total: 0, hasMore: false }
    }

    const allLogs = message.logs
    const offset = input.offset ?? 0
    const limit = input.limit ?? 100
    const sliced = allLogs.slice(offset, offset + limit)

    return {
      logs: sliced,
      total: allLogs.length,
      hasMore: offset + limit < allLogs.length
    }
  }

  /**
   * 追加单条日志（追加到 messages 表的 logs 字段）
   */
  async appendLog(input: {
    projectId: string
    sessionId: string
    traceId: string
    entry: repo.LogEntry
  }): Promise<{ ok: boolean }> {
    const session = await repo.getSession(input.projectId, input.sessionId)
    if (!session) {
      return { ok: false }
    }

    // 找到对应 traceId 的消息
    const message = session.messages.find((m) => m.traceId === input.traceId)
    if (!message) {
      return { ok: false }
    }

    // 追加日志
    const currentLogs = message.logs ?? []
    const newLogs = [...currentLogs, input.entry]

    await repo.updateMessage(input.projectId, input.sessionId, message.id, {
      logs: newLogs
    })

    return { ok: true }
  }

  // ========== 私有方法 ==========

  /**
   * 清理 runnerContexts，只保留有效的 runner 键
   */
  private cleanRunnerContexts(
    contexts: repo.RunnerContextMap | undefined
  ): SessionOutput['runnerContexts'] {
    if (!contexts) return undefined

    const cleaned: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(contexts)) {
      if (VALID_RUNNERS.has(key)) {
        cleaned[key] = typeof value === 'string' ? value : undefined
      }
    }
    return Object.keys(cleaned).length > 0
      ? (cleaned as SessionOutput['runnerContexts'])
      : undefined
  }

  /**
   * 转换为 oRPC 输出格式
   */
  private toSessionOutput(session: repo.Session): SessionOutput {
    return {
      id: session.id,
      title: session.title,
      messages: session.messages.map((m) => this.toMessageOutput(m)),
      runnerContexts: this.cleanRunnerContexts(session.runnerContexts),
      archived: session.archived,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }
  }

  /**
   * 转换消息为 oRPC 输出格式
   */
  private toMessageOutput(msg: repo.Message): MessageOutput {
    // 确保 role 是有效值
    const role = msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'assistant'
    // 确保 status 是有效值
    const status =
      msg.status === 'running' || msg.status === 'success' || msg.status === 'error'
        ? msg.status
        : undefined

    return {
      id: msg.id,
      role,
      content: msg.content,
      traceId: msg.traceId,
      status,
      logs: msg.logs,
      output: msg.output,
      errorMessage: msg.errorMessage,
      startedAt: msg.startedAt,
      runner: msg.runner
    }
  }
}

// 导出单例
export const dbSessionService = new DbSessionService()
