import { z } from 'zod'
import { RUNNER_VALUES } from '../../runners'

/** 日志条目 */
export const logEntrySchema = z.object({
  id: z.string(),
  stream: z.enum(['stdout', 'stderr']),
  text: z.string(),
  timestamp: z.number().optional()
})

/** 日志元信息（用于按需加载） */
export const logMetaSchema = z.object({
  count: z.number(),
  sizeBytes: z.number()
})

/** 消息 */
export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  /** 执行追踪标识（用于关联 RunnerEvent） */
  traceId: z.string().optional(),
  status: z.enum(['running', 'success', 'error']).optional(),
  /** @deprecated 使用 getMessageLogs 按需加载，仅用于向后兼容 */
  logs: z.array(logEntrySchema).optional(),
  /** 日志元信息，通过 traceId 关联到独立文件 */
  logMeta: logMetaSchema.optional(),
  output: z.string().optional(),
  errorMessage: z.string().optional(),
  sessionId: z.string().optional(),
  startedAt: z.number().optional(),
  runner: z.string().optional()
})

/**
 * 各 runner 的 CLI 上下文标识映射，支持同一会话切换不同 runner 时保持各自上下文
 * 例如: { "codex": "abc123", "claude-code-glm": "xyz789" }
 */
export const runnerContextMapSchema = z.record(z.enum(RUNNER_VALUES), z.string().optional())

/** 会话 */
export const sessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(messageSchema),
  /** 各 runner 的 CLI 上下文标识映射 */
  runnerContexts: runnerContextMapSchema.optional(),
  /** 是否已归档（不删除但隐藏） */
  archived: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})

export const createSessionInputSchema = z.object({
  projectId: z.string(),
  title: z.string().optional()
})

export const updateSessionInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  title: z.string().optional(),
  runnerContexts: runnerContextMapSchema.optional(),
  /** 归档/取消归档 */
  archived: z.boolean().optional()
})

export const deleteSessionInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string()
})

export const appendMessagesInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  messages: z.array(messageSchema)
})

export const updateMessageInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  messageId: z.string(),
  patch: messageSchema.partial()
})

export const listSessionsInputSchema = z.object({
  projectId: z.string(),
  /** 是否包含已归档的会话，默认 false */
  includeArchived: z.boolean().optional()
})

export const getSessionInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string()
})

/** 获取消息日志输入 */
export const getMessageLogsInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  traceId: z.string(),
  offset: z.number().optional(),
  limit: z.number().optional()
})

/** 获取消息日志输出 */
export const logsResultSchema = z.object({
  logs: z.array(logEntrySchema),
  total: z.number(),
  hasMore: z.boolean()
})

/** 追加日志输入 */
export const appendLogInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  traceId: z.string(),
  entry: logEntrySchema
})

// ============================================================================
// Inferred Types
// ============================================================================

/** 会话 */
export type Session = z.infer<typeof sessionSchema>

/** 消息 */
export type Message = z.infer<typeof messageSchema>

/** 日志条目 */
export type LogEntry = z.infer<typeof logEntrySchema>

/** 日志元信息 */
export type LogMeta = z.infer<typeof logMetaSchema>

/** 日志结果 */
export type LogsResult = z.infer<typeof logsResultSchema>

