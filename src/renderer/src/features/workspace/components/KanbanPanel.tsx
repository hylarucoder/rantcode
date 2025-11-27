import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  MoreHorizontal,
  GripVertical,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  FileText,
  RefreshCw,
  ExternalLink
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useFsTreeQuery } from '@/features/spec/api/hooks'
import { fetchFile } from '@/features/spec/api/fs'
import { orpc } from '@/lib/orpcQuery'
import { toast } from 'sonner'
import type { FsTreeNode } from '@/types'

// Task 类型定义（与 docs/design/data-model.md 对齐）
type TaskStatus = 'backlog' | 'in-progress' | 'review' | 'done' | 'blocked'
type TaskPriority = 'P0' | 'P1' | 'P2'

interface Task {
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

// 解析 frontmatter
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return {}

  const frontmatter: Record<string, string> = {}
  const lines = match[1].split('\n')
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line
        .slice(colonIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
      frontmatter[key] = value
    }
  }
  return frontmatter
}

// 更新 frontmatter 中的字段
function updateFrontmatter(content: string, key: string, value: string): string {
  const match = content.match(/^(---\s*\n)([\s\S]*?)(\n---)/)
  if (!match) {
    // 没有 frontmatter，创建一个
    return `---\n${key}: ${value}\n---\n\n${content}`
  }

  const [, start, fmContent, end] = match
  const lines = fmContent.split('\n')
  let found = false

  const newLines = lines.map((line) => {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const lineKey = line.slice(0, colonIndex).trim()
      if (lineKey === key) {
        found = true
        return `${key}: ${value}`
      }
    }
    return line
  })

  if (!found) {
    newLines.push(`${key}: ${value}`)
  }

  const restContent = content.slice(match[0].length)
  return `${start}${newLines.join('\n')}${end}${restContent}`
}

// 从文件名生成标题
function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

interface KanbanPanelProps {
  projectId: string
}

export function KanbanPanel({ projectId }: KanbanPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)

  // 获取 docs/task 目录树
  const taskTreeQuery = useFsTreeQuery({
    base: 'docs',
    depth: 2,
    projectId,
    enabled: !!projectId
  })

  // 从目录树中提取 task 文件
  const taskFiles = useMemo(() => {
    const root = taskTreeQuery.data as FsTreeNode | null
    if (!root?.children) return []

    // 找到 task 目录
    const taskDir = root.children.find(
      (child) => child?.dir && (child.name === 'task' || child.path?.endsWith('/task'))
    )
    if (!taskDir?.children) return []

    // 过滤出 .md 文件（排除 README）
    return taskDir.children
      .filter(
        (child) =>
          child &&
          !child.dir &&
          child.name?.endsWith('.md') &&
          child.name.toLowerCase() !== 'readme.md'
      )
      .map((child) => ({
        name: child.name || '',
        path: child.path || `task/${child.name}`
      }))
  }, [taskTreeQuery.data])

  // 加载任务文件内容
  const loadTasks = useCallback(async () => {
    if (!projectId || taskFiles.length === 0) {
      setTasks([])
      setLoading(false)
      return
    }

    setLoading(true)
    const loadedTasks: Task[] = []

    for (const file of taskFiles) {
      try {
        const { content } = await fetchFile({
          base: 'docs',
          path: file.path,
          projectId
        })

        const fm = parseFrontmatter(content)
        const task: Task = {
          id: file.path,
          title: fm.title || titleFromFilename(file.name),
          status: (fm.status as TaskStatus) || 'backlog',
          priority: fm.priority as TaskPriority | undefined,
          owner: fm.owner,
          filePath: file.path
        }
        loadedTasks.push(task)
      } catch (err) {
        console.warn(`Failed to load task file: ${file.path}`, err)
      }
    }

    setTasks(loadedTasks)
    setLoading(false)
  }, [projectId, taskFiles])

  // 文件变化时重新加载
  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  // 按状态分组任务
  const tasksByStatus = useMemo(() => {
    return columns.reduce(
      (acc, col) => {
        acc[col.id] = tasks.filter((t) => t.status === col.id)
        return acc
      },
      {} as Record<TaskStatus, Task[]>
    )
  }, [tasks])

  // 更新任务状态（同时更新本地状态和文件）
  const updateTaskStatus = useCallback(
    async (task: Task, newStatus: TaskStatus) => {
      if (task.status === newStatus) return

      // 先更新本地状态（乐观更新）
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)))

      try {
        // 读取文件内容
        const { content } = await fetchFile({
          base: 'docs',
          path: task.filePath,
          projectId
        })

        // 更新 frontmatter
        const newContent = updateFrontmatter(content, 'status', newStatus)

        // 写回文件
        await (
          orpc.fs.write as {
            call: (opts: {
              base: string
              path: string
              content: string
              projectId: string
            }) => Promise<{ ok: boolean }>
          }
        ).call({
          base: 'docs',
          path: task.filePath,
          content: newContent,
          projectId
        })

        toast.success(`任务已移至「${columns.find((c) => c.id === newStatus)?.label}」`)
      } catch (err) {
        // 回滚本地状态
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)))
        toast.error('更新任务状态失败')
        console.error('Failed to update task status:', err)
      }
    },
    [projectId]
  )

  // 拖拽处理
  const handleDragStart = (task: Task) => {
    setDraggedTask(task)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (status: TaskStatus) => {
    if (draggedTask && draggedTask.status !== status) {
      void updateTaskStatus(draggedTask, status)
    }
    setDraggedTask(null)
  }

  // 在编辑器中打开文件
  const openInEditor = (filePath: string) => {
    // 通过 window.api 打开文件（如果有实现）
    console.log('Open in editor:', filePath)
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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => void loadTasks()}
            disabled={loading}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && tasks.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center text-muted-foreground">
            <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin" />
            <p className="text-sm">加载任务中...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && tasks.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="mb-1 text-sm font-medium">暂无任务</p>
            <p className="text-xs">
              在 <code className="rounded bg-muted px-1">docs/task/</code> 目录创建 .md 文件
            </p>
            <p className="mt-2 text-xs">
              文件需要包含 frontmatter:
              <br />
              <code className="text-[10px]">status: backlog | in-progress | review | done</code>
            </p>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {tasks.length > 0 && (
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
                        <div className="min-w-0 flex-1">
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
                            {task.owner && (
                              <span className="truncate text-[10px] text-muted-foreground">
                                {task.owner}
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
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => openInEditor(task.filePath)}>
                              <ExternalLink className="mr-2 h-3.5 w-3.5" />
                              打开文件
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {columns
                              .filter((c) => c.id !== task.status)
                              .map((c) => (
                                <DropdownMenuItem
                                  key={c.id}
                                  onClick={() => void updateTaskStatus(task, c.id)}
                                >
                                  <span className={cn('mr-2 h-2 w-2 rounded-full', c.color)} />
                                  移至 {c.label}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  ))}

                  {/* Empty column hint */}
                  {columnTasks.length === 0 && (
                    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground">
                      拖拽任务到此处
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer hint */}
      <div className="border-t border-border/50 px-4 py-2">
        <p className="text-xs text-muted-foreground">
          <FileText className="mr-1 inline-block h-3 w-3" />
          任务来自 <code className="rounded bg-muted px-1">docs/task/*.md</code> · 修改文件
          frontmatter 中的 <code className="rounded bg-muted px-1">status</code> 字段来移动任务
        </p>
      </div>
    </div>
  )
}
