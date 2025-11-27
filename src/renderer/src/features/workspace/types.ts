export type ChatRole = 'user' | 'assistant'

export interface CodexLogEntry {
  id: string
  stream: 'stdout' | 'stderr'
  text: string
  timestamp?: number
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  jobId?: string
  status?: 'running' | 'success' | 'error'
  logs?: CodexLogEntry[]
  output?: string
  errorMessage?: string
  sessionId?: string
  // 任务开始执行的时间戳（ms）
  startedAt?: number
  // 执行任务的 agent
  agent?: string
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  codexSessionId?: string
}

export type RightPanelTab = 'preview' | 'conversation'
