import type { ServicePrototype } from 'orpc'

// Shared web UI domain types (ported from rantcode-cli/ui/src/types)

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

export interface HealthResponse {
  status: 'ok' | string
}

export interface FsTreeNode {
  path: string
  name: string
  dir: boolean
  children?: FsTreeNode[]
}

export interface FsFile {
  path: string
  content: string
}

export interface SpecDocMeta {
  path: string
  title?: string
  status?: string
  fields?: Record<string, string>
  errors?: string[]
  warnings?: string[]
  content?: string
}

export interface DiffChangeItem {
  path: string
  status: string
  group: 'Staged' | 'Unstaged' | 'Untracked' | string
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

export interface DiffFileResponse {
  path: string
  mode: 'all' | 'staged' | 'worktree' | string
  diff: string
  split?: SplitRow[]
}

export interface TaskItem {
  path: string
  title?: string
  status?: string
  owner?: string
  priority?: string
  due?: string
  fields?: Record<string, string>
}

export interface ProjectInfo {
  id: string
  name: string
  repoPath: string
  createdAt: string
  updatedAt: string
  lastOpenedAt?: string
}

export interface CreateProjectInput {
  repoPath: string
  name?: string
}

export interface UpdateProjectInput {
  id: string
  name?: string
  repoPath?: string
}

export interface ProjectSelection {
  workspaceId?: string
}

// RPC service prototypes and schema
// RPC service prototypes and schema

export interface SystemServicePrototype extends ServicePrototype {
  health(): Promise<HealthResponse>
  version(): Promise<{ version: string }>
}

export interface FsServicePrototype extends ServicePrototype {
  tree(opts: {
    base?: 'repo' | 'docs' | 'vibe-spec' | ''
    depth?: number
    workspaceId?: string
  }): Promise<FsTreeNode>
  read(opts: {
    base?: 'repo' | 'docs' | 'vibe-spec' | ''
    path: string
    workspaceId?: string
  }): Promise<FsFile>
}

export interface ProjectServicePrototype extends ServicePrototype {
  list(): Promise<ProjectInfo[]>
  add(input: CreateProjectInput): Promise<ProjectInfo>
  update(input: UpdateProjectInput): Promise<ProjectInfo>
  remove(opts: { id: string }): Promise<{ ok: boolean }>
  pickRepoPath(): Promise<{ path: string } | null>
}

export interface RantcodeRpcSchema {
  system: SystemServicePrototype
  fs: FsServicePrototype
  projects: ProjectServicePrototype
}

export type DocsWatcherChangeType = 'add' | 'change' | 'unlink'

export type DocsWatcherEvent =
  | {
      workspaceId?: string
      kind: 'ready'
      root: string
    }
  | {
      workspaceId?: string
      kind: 'error'
      message: string
    }
  | {
      workspaceId?: string
      kind: 'file'
      changeType: DocsWatcherChangeType
      path: string
      updatedAt: number
      content?: string
    }

export interface CodexRunOptions {
  engine?: 'codex' | 'claude-code' | 'kimi-cli'
  workspaceId?: string
  prompt: string
  extraArgs?: string[]
  timeoutMs?: number
  jobId?: string
  sessionId?: string
}

export type CodexEvent =
  | {
      type: 'start'
      jobId: string
      command: string[]
      cwd: string
    }
  | {
      type: 'log'
      jobId: string
      stream: 'stdout' | 'stderr'
      data: string
    }
  | {
      type: 'exit'
      jobId: string
      code: number | null
      signal: NodeJS.Signals | null
      durationMs: number
    }
  | {
      type: 'session'
      jobId: string
      sessionId: string
    }
  | {
      type: 'error'
      jobId: string
      message: string
    }
