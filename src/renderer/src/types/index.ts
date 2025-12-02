// Re-export RPC types from shared schemas (single source of truth)
export type {
  FsTreeNode,
  FsFile,
  HealthResponse,
  ProjectInfo,
  CreateProjectInput,
  UpdateProjectInput,
  GitFileStatus,
  GitStatus,
  GitDiff,
  Session,
  Message,
  LogEntry,
  LogMeta,
  LogsResult,
  GeneralSettings
} from '@shared/orpc/schemas'

// Pure UI types (not related to RPC)

export type Role = 'user' | 'admin' | 'superuser'

export interface User {
  id: number
  email: string
  name?: string
  role: Role
  createdAt?: string
  updatedAt?: string
}

export interface ApiError {
  message: string
  traceId?: string
  status?: number
}

export interface UploadResponse {
  id: number
  path: string
  name: string
  size: number
  mime: string
  url: string
}

// Spec UI related types
export interface SpecDocMeta {
  path: string
  title?: string
  status?: string
  fields?: Record<string, string>
  errors?: string[]
  warnings?: string[]
  content?: string
}

// Diff UI types (for rendering, not RPC)
export interface DiffChangeItem {
  path: string
  status: string // e.g., ' M', 'A ', '??'
  group: 'Staged' | 'Unstaged' | 'Untracked' | string
}

export interface DiffFileResponse {
  path: string
  mode: 'all' | 'staged' | 'worktree' | string
  diff: string
  split?: SplitRow[]
}

export type SplitSide = 'ctx' | 'del' | 'add' | 'meta' | 'empty'

export interface SplitRow {
  left: string
  right: string
  lt: SplitSide
  rt: SplitSide
  ln?: number
  rn?: number
}

// Task UI types
export interface TaskItem {
  path: string
  title?: string
  status?: string
  owner?: string
  priority?: string
  due?: string
  fields?: Record<string, string>
}
