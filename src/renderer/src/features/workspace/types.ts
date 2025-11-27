import type { Agent } from '@shared/agents'

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
  /** 执行任务的 agent */
  agent?: string
}

/**
 * 每个 Agent 类型对应一个 sessionId，用于上下文续写
 * 例如: { "codex": "abc123", "claude-code-glm": "xyz789" }
 */
export type AgentSessionMap = Partial<Record<Agent, string>>

/** 会话 */
export interface Session {
  id: string
  title: string
  messages: Message[]
  /** 各 agent 的 sessionId 映射，支持同一会话切换不同 agent 时保持各自上下文 */
  agentSessions?: AgentSessionMap
}

export type RightPanelTab = 'preview' | 'conversation'
