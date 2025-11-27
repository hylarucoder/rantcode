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
  version?: string
  costUsd?: number
  durationMs?: number
}

export type LogEvent =
  | { type: 'session_start'; meta: SessionMeta }
  | { type: 'user'; text: string }
  | { type: 'assistant'; text: string }
  | { type: 'note'; channel: 'thinking' | 'system'; text: string }
  | { type: 'tool_call'; name: string; argsText: string }
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

