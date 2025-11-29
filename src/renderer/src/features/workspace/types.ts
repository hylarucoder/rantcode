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

/** 消息状态 */
export type MessageStatus = 'running' | 'success' | 'error'

/** 会话中的消息 */
export interface Message {
  id: string
  role: MessageRole
  content: string
  jobId?: string
  status?: MessageStatus
  logs?: LogEntry[]
  output?: string
  errorMessage?: string
  sessionId?: string
  /** 任务开始执行的时间戳（ms） */
  startedAt?: number
  /** 执行任务的 runner */
  runner?: string
}

/**
 * 每个 Runner 类型对应一个 sessionId，用于上下文续写
 * 例如: { "codex": "abc123", "claude-code-glm": "xyz789" }
 */
export type RunnerSessionMap = Partial<Record<Runner, string>>

/** 会话 */
export interface Session {
  id: string
  title: string
  messages: Message[]
  /** 各 runner 的 sessionId 映射，支持同一会话切换不同 runner 时保持各自上下文 */
  runnerSessions?: RunnerSessionMap
}

export type RightPanelTab = 'preview' | 'trace'
