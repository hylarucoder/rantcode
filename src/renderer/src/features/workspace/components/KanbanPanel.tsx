import { useState } from 'react'
import {
  Plus,
  MoreHorizontal,
  GripVertical,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

// Task 类型定义（与 docs/design/data-model.md 对齐）
type TaskStatus = 'backlog' | 'in-progress' | 'review' | 'done' | 'blocked'
type TaskPriority = 'P0' | 'P1' | 'P2'

interface Task {
  id: string
  title: string
  status: TaskStatus
  priority?: TaskPriority
  owner?: string
  createdAt: string
  updatedAt: string
}

// 列配置
const columns: { id: TaskStatus; label: string; color: string; icon: typeof Circle }[] = [
  { id: 'backlog', label: '待办', color: 'bg-slate-500', icon: Circle },
  { id: 'in-progress', label: '进行中', color: 'bg-blue-500', icon: Clock },
  { id: 'review', label: '审核', color: 'bg-amber-500', icon: AlertCircle },
  { id: 'done', label: '完成', color: 'bg-emerald-500', icon: CheckCircle2 }
]

// 优先级配置
const priorityConfig: Record<TaskPriority, { label: string; color: string }> = {
  P0: { label: 'P0', color: 'bg-red-500/20 text-red-600 dark:text-red-400' },
  P1: { label: 'P1', color: 'bg-amber-500/20 text-amber-600 dark:text-amber-400' },
  P2: { label: 'P2', color: 'bg-slate-500/20 text-slate-600 dark:text-slate-400' }
}

interface KanbanPanelProps {
  workspaceId: string
}

export function KanbanPanel({ workspaceId: _workspaceId }: KanbanPanelProps) {
  // workspaceId 将用于后续持久化任务数据
  void _workspaceId
  // 本地状态管理（后续可接入持久化）
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: '实现用户登录功能',
      status: 'in-progress',
      priority: 'P0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: '2',
      title: '修复首页加载缓慢问题',
      status: 'backlog',
      priority: 'P1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: '3',
      title: '添加单元测试',
      status: 'review',
      priority: 'P2',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ])

  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [addingToColumn, setAddingToColumn] = useState<TaskStatus | null>(null)
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)

  // 按状态分组任务
  const tasksByStatus = columns.reduce(
    (acc, col) => {
      acc[col.id] = tasks.filter((t) => t.status === col.id)
      return acc
    },
    {} as Record<TaskStatus, Task[]>
  )

  // 添加任务
  const addTask = (status: TaskStatus) => {
    if (!newTaskTitle.trim()) return
    const now = new Date().toISOString()
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: newTaskTitle.trim(),
      status,
      priority: 'P2',
      createdAt: now,
      updatedAt: now
    }
    setTasks((prev) => [...prev, newTask])
    setNewTaskTitle('')
    setAddingToColumn(null)
  }

  // 移动任务
  const moveTask = (taskId: string, newStatus: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t
      )
    )
  }

  // 删除任务
  const deleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
  }

  // 拖拽处理
  const handleDragStart = (task: Task) => {
    setDraggedTask(task)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (status: TaskStatus) => {
    if (draggedTask && draggedTask.status !== status) {
      moveTask(draggedTask.id, status)
    }
    setDraggedTask(null)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">任务看板</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {tasks.length} 个任务
          </span>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {columns.map((column) => {
          const columnTasks = tasksByStatus[column.id] || []

          return (
            <div
              key={column.id}
              className="flex w-72 min-w-[288px] flex-col rounded-lg bg-muted/30"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(column.id)}
            >
              {/* Column Header */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className={cn('h-2 w-2 rounded-full', column.color)} />
                {/* Icon 可用于后续扩展 */}
                <span className="text-sm font-medium">{column.label}</span>
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {columnTasks.length}
                </span>
              </div>

              {/* Tasks */}
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {columnTasks.map((task) => (
                  <Card
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task)}
                    className={cn(
                      'group cursor-grab rounded-lg border-border/50 bg-card p-3 shadow-sm transition-all',
                      'hover:border-border hover:shadow-md',
                      'active:cursor-grabbing',
                      draggedTask?.id === task.id && 'opacity-50'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug">{task.title}</p>
                        <div className="mt-2 flex items-center gap-2">
                          {task.priority && (
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                priorityConfig[task.priority].color
                              )}
                            >
                              {priorityConfig[task.priority].label}
                            </span>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          {columns
                            .filter((c) => c.id !== task.status)
                            .map((c) => (
                              <DropdownMenuItem key={c.id} onClick={() => moveTask(task.id, c.id)}>
                                移至 {c.label}
                              </DropdownMenuItem>
                            ))}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteTask(task.id)}
                          >
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                ))}

                {/* Add Task */}
                {addingToColumn === column.id ? (
                  <Card className="rounded-lg border-border/50 bg-card p-2">
                    <Input
                      autoFocus
                      placeholder="输入任务标题..."
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addTask(column.id)
                        if (e.key === 'Escape') {
                          setAddingToColumn(null)
                          setNewTaskTitle('')
                        }
                      }}
                      onBlur={() => {
                        if (newTaskTitle.trim()) {
                          addTask(column.id)
                        } else {
                          setAddingToColumn(null)
                        }
                      }}
                      className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                    />
                  </Card>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start gap-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setAddingToColumn(column.id)}
                  >
                    <Plus className="h-4 w-4" />
                    添加任务
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer hint */}
      <div className="border-t border-border/50 px-4 py-2">
        <p className="text-xs text-muted-foreground">
          拖拽卡片移动任务 · 任务将关联到 docs/task/ 中的文档
        </p>
      </div>
    </div>
  )
}
