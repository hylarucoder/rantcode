/**
 * 看板相关类型定义
 */

import { Circle, Clock, AlertCircle, CheckCircle2 } from 'lucide-react'

// Task 类型定义（与 agent-docs/design/data-model.md 对齐）
export type TaskStatus = 'backlog' | 'todo' | 'doing' | 'in-review' | 'done' | 'canceled'
export type TaskPriority = 'P0' | 'P1' | 'P2'

export interface Task {
  id: string
  title: string
  status: TaskStatus
  priority?: TaskPriority
  owner?: string
  filePath: string // 对应的文件路径
  createdAt?: string
  updatedAt?: string
}

// 列配置
export const columns: {
  id: TaskStatus
  labelKey: string
  color: string
  icon: typeof Circle
}[] = [
  {
    id: 'backlog',
    labelKey: 'workspace.kanban.columns.backlog',
    color: 'bg-slate-500',
    icon: Circle
  },
  { id: 'todo', labelKey: 'workspace.kanban.columns.todo', color: 'bg-violet-500', icon: Circle },
  { id: 'doing', labelKey: 'workspace.kanban.columns.doing', color: 'bg-blue-500', icon: Clock },
  {
    id: 'in-review',
    labelKey: 'workspace.kanban.columns.inReview',
    color: 'bg-amber-500',
    icon: AlertCircle
  },
  {
    id: 'done',
    labelKey: 'workspace.kanban.columns.done',
    color: 'bg-emerald-500',
    icon: CheckCircle2
  },
  {
    id: 'canceled',
    labelKey: 'workspace.kanban.columns.canceled',
    color: 'bg-red-500/50',
    icon: Circle
  }
]

// 优先级配置
export const priorityConfig: Record<TaskPriority, { label: string; color: string }> = {
  P0: { label: 'P0', color: 'bg-red-500/20 text-red-600 dark:text-red-400' },
  P1: { label: 'P1', color: 'bg-amber-500/20 text-amber-600 dark:text-amber-400' },
  P2: { label: 'P2', color: 'bg-slate-500/20 text-slate-600 dark:text-slate-400' }
}
