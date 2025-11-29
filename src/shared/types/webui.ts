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
  projectId?: string
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
    projectId?: string
  }): Promise<FsTreeNode>
  read(opts: {
    base?: 'repo' | 'docs' | 'vibe-spec' | ''
    path: string
    projectId?: string
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
      projectId?: string
      kind: 'ready'
      root: string
    }
  | {
      projectId?: string
      kind: 'error'
      message: string
    }
  | {
      projectId?: string
      kind: 'file'
      changeType: DocsWatcherChangeType
      path: string
      updatedAt: number
      content?: string
    }

import type { Runner } from '../runners'

/** Runner 执行选项 */
export interface RunnerRunOptions {
  /** 使用的 Runner（底层执行器） */
  runner?: Runner
  projectId?: string
  prompt: string
  extraArgs?: string[]
  timeoutMs?: number
  /** 执行追踪标识（用于关联消息和事件） */
  traceId?: string
  /** Runner CLI 上下文标识（用于上下文续写） */
  contextId?: string
}

/** Runner 执行事件流 */
export type RunnerEvent =
  | {
      type: 'start'
      traceId: string
      command: string[]
      cwd: string
    }
  | {
      type: 'log'
      traceId: string
      stream: 'stdout' | 'stderr'
      data: string
    }
  | {
      type: 'exit'
      traceId: string
      code: number | null
      signal: NodeJS.Signals | null
      durationMs: number
    }
  | {
      type: 'context'
      traceId: string
      /** Runner CLI 上下文标识 */
      contextId: string
    }
  | {
      type: 'error'
      traceId: string
      message: string
    }
  | {
      // 流式文本内容（从 Claude Code assistant 消息中提取）
      type: 'text'
      traceId: string
      text: string
      delta?: boolean // true 表示增量文本，false 表示完整文本
    }
  | {
      // Claude Code 特有的结构化消息
      type: 'claude_message'
      traceId: string
      messageType: 'init' | 'assistant' | 'result' | 'user' | 'system'
      content?: string
      raw?: unknown // 原始 JSON 数据
    }
