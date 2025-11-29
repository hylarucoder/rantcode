import type { Runner } from '@shared/runners'

/** 消息角色 */
export type MessageRole = 'user' | 'assistant'

/** 执行日志条目 */
export interface LogEntry {
  id: string
  stream: 'stdout' | 'stderr'
  text: string
  timestamp?: number
}

/** 日志元信息（用于按需加载） */
export interface LogMeta {
  count: number
  sizeBytes: number
}

/** 消息状态 */
export type MessageStatus = 'running' | 'success' | 'error'

/** 会话中的消息 */
export interface Message {
  id: string
  role: MessageRole
  content: string
  /** 消息创建时间戳（ms） */
  createdAt?: number
  /** 执行追踪标识（用于关联 RunnerEvent） */
  traceId?: string
  status?: MessageStatus
  /** @deprecated 使用 getMessageLogs 按需加载 */
  logs?: LogEntry[]
  /** 日志元信息，通过 traceId 关联到独立文件 */
  logMeta?: LogMeta
  output?: string
  errorMessage?: string
  /** Runner CLI 上下文标识（用于显示） */
  contextId?: string
  /** 任务开始执行的时间戳（ms） */
  startedAt?: number
  /** 执行任务的 runner */
  runner?: string
}

/**
 * 每个 Runner 类型对应一个 CLI 上下文标识，用于上下文续写
 * 例如: { "codex": "abc123", "claude-code-glm": "xyz789" }
 */
export type RunnerContextMap = Partial<Record<Runner, string>>

/** 会话 */
export interface Session {
  id: string
  title: string
  messages: Message[]
  /** 各 runner 的 CLI 上下文标识映射，支持同一会话切换不同 runner 时保持各自上下文 */
  runnerContexts?: RunnerContextMap
  /** 是否已归档（不删除但隐藏） */
  archived?: boolean
}

export type RightPanelTab = 'preview' | 'trace'
