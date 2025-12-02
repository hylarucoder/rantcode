/**
 * Shared types for web UI (Notify channel events and Runner types)
 *
 * NOTE: RPC-related types should be imported from '@shared/orpc/schemas'
 * This file only contains Notify channel event types and Runner execution types
 */

import type { Runner } from '../runners'

// ============================================================================
// Docs Watcher Events (Notify channel)
// ============================================================================

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

// ============================================================================
// Runner Events (Notify channel)
// ============================================================================

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
