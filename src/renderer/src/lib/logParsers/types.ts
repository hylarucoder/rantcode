/*
  Shared types for Agent Trace parsers.
*/

/** 轨迹元信息 */
export interface TraceMeta {
  workdir?: string
  model?: string
  provider?: string
  approval?: string
  sandbox?: string
  reasoningEffort?: string
  reasoningSummaries?: string
  /** Runner CLI 上下文标识 */
  contextId?: string
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

/** 轨迹中的单个事件 */
export type TraceEvent =
  | { type: 'session_start'; meta: TraceMeta }
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

/** 一次执行的轨迹（包含多个事件） */
export interface TraceSession {
  meta: TraceMeta
  events: TraceEvent[]
}

export type LogParser = (text: string) => TraceSession[] | null
