/*
  Shared types for conversation log parsers.
*/

export interface SessionMeta {
  workdir?: string
  model?: string
  provider?: string
  approval?: string
  sandbox?: string
  reasoningEffort?: string
  reasoningSummaries?: string
  sessionId?: string
  parentSessionId?: string // resume 时被恢复的 session ID
  version?: string
  costUsd?: number
  durationMs?: number
}

// TodoWrite 工具的结构化数据
export interface TodoItem {
  id?: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
}

// 工具调用的结构化参数（可扩展）
export type ToolCallData =
  | { kind: 'todo_write'; todos: TodoItem[]; merge?: boolean }
  | { kind: 'read'; filePath: string; offset?: number; limit?: number }
  | { kind: 'edit'; filePath: string; oldString?: string; newString?: string }
  | { kind: 'glob'; pattern: string }
  | { kind: 'grep'; pattern: string; path?: string }
  | { kind: 'bash'; command: string }
  | { kind: 'generic'; args: unknown }

export type LogEvent =
  | { type: 'session_start'; meta: SessionMeta }
  | { type: 'user'; text: string }
  | { type: 'assistant'; text: string }
  | { type: 'note'; channel: 'thinking' | 'system'; text: string }
  | { type: 'tool_call'; name: string; argsText: string; data?: ToolCallData }
  | { type: 'tool_result'; ok: boolean; code?: number; durationMs?: number; text?: string }
  | { type: 'exec_call'; command: string; workdir?: string }
  | { type: 'exec_result'; ok: boolean; code?: number; durationMs?: number; text?: string }
  | { type: 'patch'; header: string; diff: string }
  | { type: 'plan_update'; text: string }
  | { type: 'stats'; name: 'tokens used'; value: string }
  | { type: 'truncated'; reason: string }
  | { type: 'unknown'; raw: string }

export interface ConversationSession {
  meta: SessionMeta
  events: LogEvent[]
}

export type LogParser = (text: string) => ConversationSession[] | null
