import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { motion, AnimatePresence } from 'motion/react'
import {
  MoreHorizontal,
  GripVertical,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  FileText,
  RefreshCw,
  ExternalLink,
  MessageCircle
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
import { DocDrawer } from '@/components/DocDrawer'
import { useFsTreeQuery } from '@/features/spec/api/hooks'
import { fetchFile } from '@/features/spec/api/fs'
import { orpc } from '@/lib/orpcQuery'
import { toast } from 'sonner'
import type { FsTreeNode } from '@/types'

// Task 类型定义（与 docs/design/data-model.md 对齐）
type TaskStatus = 'backlog' | 'todo' | 'doing' | 'in-review' | 'done' | 'canceled'
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
const columns: { id: TaskStatus; labelKey: string; color: string; icon: typeof Circle }[] = [
  { id: 'backlog', labelKey: 'workspace.kanban.columns.backlog', color: 'bg-slate-500', icon: Circle },
  { id: 'todo', labelKey: 'workspace.kanban.columns.todo', color: 'bg-violet-500', icon: Circle },
  { id: 'doing', labelKey: 'workspace.kanban.columns.doing', color: 'bg-blue-500', icon: Clock },
  { id: 'in-review', labelKey: 'workspace.kanban.columns.inReview', color: 'bg-amber-500', icon: AlertCircle },
  { id: 'done', labelKey: 'workspace.kanban.columns.done', color: 'bg-emerald-500', icon: CheckCircle2 },
  { id: 'canceled', labelKey: 'workspace.kanban.columns.canceled', color: 'bg-red-500/50', icon: Circle }
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

// 可排序的任务卡片组件
interface SortableTaskCardProps {
  task: Task
  isDragging?: boolean
  isOverlay?: boolean
  onOpenFile: (filePath: string) => void
  onChatWithFile?: (filePath: string) => void
  onTitleClick: (task: Task) => void
  onStatusChange: (task: Task, newStatus: TaskStatus) => void
  t: (key: string, options?: Record<string, string>) => string
}

function SortableTaskCard({
  task,
  isDragging,
  isOverlay,
  onOpenFile,
  onChatWithFile,
  onTitleClick,
  onStatusChange,
  t
}: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging
  } = useSortable({
    id: task.id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  // 拖拽时隐藏原卡片（由 DragOverlay 显示）
  if (isSortableDragging) {
    return (
      <div ref={setNodeRef} style={style} className="h-[72px] rounded-lg border-2 border-dashed border-primary/30 bg-primary/5" />
    )
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      layoutId={isOverlay ? undefined : task.id}
      initial={isOverlay ? { scale: 1.05, rotate: 3 } : false}
      animate={isOverlay ? { scale: 1.05, rotate: 3 } : { scale: 1, rotate: 0 }}
      whileHover={isOverlay ? undefined : { scale: 1.02 }}
      transition={{
        layout: { type: 'spring', stiffness: 350, damping: 30 },
        scale: { type: 'spring', stiffness: 400, damping: 25 }
      }}
    >
      <Card
        className={cn(
          'group rounded-lg border-border/50 bg-card p-3 shadow-sm',
          'hover:border-border hover:shadow-md',
          isDragging && 'ring-2 ring-primary/50 shadow-lg',
          isOverlay && 'shadow-2xl cursor-grabbing border-primary/50'
        )}
      >
        <div className="flex items-start gap-2">
          <div
            {...attributes}
            {...listeners}
            className={cn(
              'mt-0.5 shrink-0 cursor-grab touch-none',
              'text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100',
              isOverlay && 'opacity-100 cursor-grabbing'
            )}
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (!isOverlay) {
                  onTitleClick(task)
                }
              }}
              className={cn(
                'text-sm leading-snug text-left w-full',
                !isOverlay && 'hover:text-primary hover:underline underline-offset-2 cursor-pointer transition-colors'
              )}
            >
              {task.title}
            </button>
            <div className="mt-2 flex items-center gap-2">
              {task.priority && priorityConfig[task.priority] && (
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
                <span className="truncate text-[10px] text-muted-foreground">{task.owner}</span>
              )}
            </div>
          </div>
          {!isOverlay && (
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
                <DropdownMenuItem onClick={() => onOpenFile(task.filePath)}>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  {t('workspace.kanban.openFile')}
                </DropdownMenuItem>
                {onChatWithFile && (
                  <DropdownMenuItem onClick={() => onChatWithFile(task.filePath)}>
                    <MessageCircle className="mr-2 h-3.5 w-3.5" />
                    {t('workspace.kanban.chat')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {columns
                  .filter((c) => c.id !== task.status)
                  .map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => onStatusChange(task, c.id)}>
                      <span className={cn('mr-2 h-2 w-2 rounded-full', c.color)} />
                      {t('workspace.kanban.moveTo', { column: t(c.labelKey) })}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </Card>
    </motion.div>
  )
}

// 任务卡片预览（用于 DragOverlay）
function TaskCardOverlay({ task, t }: { task: Task; t: (key: string, options?: Record<string, string>) => string }) {
  return (
    <SortableTaskCard task={task} isOverlay onOpenFile={() => {}} onChatWithFile={undefined} onTitleClick={() => {}} onStatusChange={() => {}} t={t} />
  )
}

// 可放置的列组件
interface DroppableColumnProps {
  column: (typeof columns)[number]
  tasks: Task[]
  activeId: string | null
  onOpenFile: (filePath: string) => void
  onChatWithFile?: (filePath: string) => void
  onTitleClick: (task: Task) => void
  onStatusChange: (task: Task, newStatus: TaskStatus) => void
  t: (key: string, options?: Record<string, string>) => string
}

function DroppableColumn({
  column,
  tasks,
  activeId,
  onOpenFile,
  onChatWithFile,
  onTitleClick,
  onStatusChange,
  t
}: DroppableColumnProps) {
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])

  // 使列本身成为可放置目标（用于空列或拖到列底部）
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: 'column', status: column.id }
  })

  return (
    <motion.div
      layout
      className="flex w-72 min-w-[288px] flex-col rounded-lg bg-muted/30"
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={cn('h-2 w-2 rounded-full', column.color)} />
        <span className="text-sm font-medium">{t(column.labelKey)}</span>
        <motion.span
          key={tasks.length}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          className="ml-auto rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          {tasks.length}
        </motion.span>
      </div>

      {/* Tasks */}
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 min-h-[100px] rounded-b-lg transition-colors',
            isOver && activeId && 'bg-primary/5'
          )}
        >
          <AnimatePresence mode="popLayout">
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                isDragging={activeId === task.id}
                onOpenFile={onOpenFile}
                onChatWithFile={onChatWithFile}
                onTitleClick={onTitleClick}
                onStatusChange={onStatusChange}
                t={t}
              />
            ))}
          </AnimatePresence>

          {/* Empty column placeholder */}
          {tasks.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                'flex h-20 items-center justify-center rounded-lg border-2 border-dashed transition-colors',
                isOver && activeId ? 'border-primary/50 bg-primary/5' : 'border-border/50'
              )}
            >
              <span className="text-xs text-muted-foreground">
                {activeId ? t('workspace.kanban.dropHere') : t('workspace.kanban.dragHere')}
              </span>
            </motion.div>
          )}
        </div>
      </SortableContext>
    </motion.div>
  )
}

interface KanbanPanelProps {
  projectId: string
  onChatWithFile?: (filePath: string) => void
}

export function KanbanPanel({ projectId, onChatWithFile }: KanbanPanelProps) {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dragStartStatus, setDragStartStatus] = useState<TaskStatus | null>(null)
  
  // 文档抽屉状态
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // 点击标题打开文档
  const handleTitleClick = useCallback((task: Task) => {
    setSelectedTask(task)
    setDrawerOpen(true)
  }, [])

  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // 需要移动 8px 才开始拖拽，防止误触
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

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

  // 获取当前拖拽的任务
  const activeTask = useMemo(() => {
    return activeId ? tasks.find((t) => t.id === activeId) : null
  }, [activeId, tasks])

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

        const columnLabel = columns.find((c) => c.id === newStatus)?.labelKey
        toast.success(t('workspace.kanban.movedTo', { column: columnLabel ? t(columnLabel) : newStatus }))
      } catch (err) {
        // 回滚本地状态
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)))
        toast.error(t('workspace.kanban.updateFailed'))
        console.error('Failed to update task status:', err)
      }
    },
    [projectId]
  )

  // 拖拽开始
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string
      const task = tasks.find((t) => t.id === id)
      setActiveId(id)
      setDragStartStatus(task?.status || null)
    },
    [tasks]
  )

  // 拖拽经过 - 处理跨列移动和同列排序
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over) return

      const activeId = active.id as string
      const overId = over.id as string

      // 如果拖到自己身上，忽略
      if (activeId === overId) return

      // 查找拖拽的任务
      const activeTask = tasks.find((t) => t.id === activeId)
      if (!activeTask) return

      // 判断目标：是任务还是列
      const isOverColumn = overId.startsWith('column-')
      const overTask = isOverColumn ? null : tasks.find((t) => t.id === overId)

      // 确定目标列
      let targetStatus: TaskStatus
      if (isOverColumn) {
        targetStatus = overId.replace('column-', '') as TaskStatus
      } else if (overTask) {
        targetStatus = overTask.status
      } else {
        return
      }

      // 跨列移动
      if (activeTask.status !== targetStatus) {
        setTasks((prev) => {
          const newTasks = prev.filter((t) => t.id !== activeId)
          const updatedTask = { ...activeTask, status: targetStatus }

          if (overTask) {
            // 插入到目标任务的位置
            const overIndex = newTasks.findIndex((t) => t.id === overId)
            newTasks.splice(overIndex, 0, updatedTask)
          } else {
            // 放到列末尾
            newTasks.push(updatedTask)
          }

          return newTasks
        })
      } else if (overTask) {
        // 同列排序
        setTasks((prev) => {
          const oldIndex = prev.findIndex((t) => t.id === activeId)
          const newIndex = prev.findIndex((t) => t.id === overId)
          return arrayMove(prev, oldIndex, newIndex)
        })
      }
    },
    [tasks]
  )

  // 拖拽结束
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active } = event
      setActiveId(null)

      const activeId = active.id as string
      const activeTask = tasks.find((t) => t.id === activeId)

      // 如果状态改变了，持久化到文件
      if (activeTask && dragStartStatus && activeTask.status !== dragStartStatus) {
        void updateTaskStatus({ ...activeTask, status: dragStartStatus }, activeTask.status)
      }

      setDragStartStatus(null)
    },
    [tasks, dragStartStatus, updateTaskStatus]
  )

  // 在编辑器中打开文件
  const openInEditor = useCallback((filePath: string) => {
    // 通过 window.api 打开文件（如果有实现）
    console.log('Open in editor:', filePath)
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{t('workspace.kanban.title')}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t('workspace.kanban.taskCount', { count: tasks.length })}
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
            {t('common.button.refresh')}
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && tasks.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center text-muted-foreground">
            <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin" />
            <p className="text-sm">{t('workspace.kanban.loading')}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && tasks.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="mb-1 text-sm font-medium">{t('workspace.kanban.empty')}</p>
            <p className="text-xs">
              {t('workspace.kanban.emptyHint')}
            </p>
            <p className="mt-2 text-xs">
              {t('workspace.kanban.frontmatterHint')}
              <br />
              <code className="text-[10px]">{t('workspace.kanban.statusHint')}</code>
            </p>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {tasks.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 gap-3 overflow-x-auto p-4">
            {columns.map((column) => (
              <DroppableColumn
                key={column.id}
                column={column}
                tasks={tasksByStatus[column.id] || []}
                activeId={activeId}
                onOpenFile={openInEditor}
                onChatWithFile={onChatWithFile}
                onTitleClick={handleTitleClick}
                onStatusChange={(task, newStatus) => void updateTaskStatus(task, newStatus)}
                t={t}
              />
            ))}
          </div>

          {/* Drag Overlay - 拖拽时显示的浮动卡片 */}
          <DragOverlay dropAnimation={null}>
            {activeTask ? <TaskCardOverlay task={activeTask} t={t} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Footer hint */}
      <div className="border-t border-border/50 px-4 py-2">
        <p className="text-xs text-muted-foreground">
          <FileText className="mr-1 inline-block h-3 w-3" />
          {t('workspace.kanban.footerHint')}
        </p>
      </div>

      {/* 文档预览抽屉 */}
      <DocDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filePath={selectedTask?.filePath}
        title={selectedTask?.title}
        projectId={projectId}
        inset={{ top: 40 }}
      />
    </div>
  )
}
