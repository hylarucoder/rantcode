/**
 * 看板面板
 *
 * 显示任务看板，支持拖拽排序和状态更新。
 * 逻辑已拆分到子组件和 utils 中。
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import { FileText, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DocDrawer } from '@/components/DocDrawer'
import { useFsTreeQuery } from '@/features/spec/api/hooks'
import { fetchFile } from '@/features/spec/api/fs'
import { orpc } from '@/lib/orpcQuery'
import { toast } from 'sonner'
import type { FsTreeNode } from '@/types'
import type { DocsWatcherEvent } from '@shared/types/webui'
import { useGlobalChatStore } from '@/state/globalChat'
import { getLogger } from '@/lib/logger'

import {
  type Task,
  type TaskStatus,
  type TaskPriority,
  columns,
  TaskCardOverlay,
  KanbanColumn,
  NewTaskDialog
} from './kanban'
import { parseFrontmatter, updateFrontmatter, titleFromFilename } from '../utils/frontmatterParser'

interface KanbanPanelProps {
  projectId: string
  onChatWithFile?: (filePath: string) => void
}

export function KanbanPanel({ projectId, onChatWithFile }: KanbanPanelProps) {
  const { t } = useTranslation()
  const log = getLogger('workspace.kanban')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dragStartStatus, setDragStartStatus] = useState<TaskStatus | null>(null)

  // 文档抽屉状态
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // 全局聊天 store
  const { setInitialPrompt, setSelectedProjectId, open: openGlobalChat } = useGlobalChatStore()

  // 点击标题打开文档
  const handleTitleClick = useCallback((task: Task) => {
    setSelectedTask(task)
    setDrawerOpen(true)
  }, [])

  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  // 自定义碰撞检测
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) {
      return pointerCollisions
    }
    return closestCorners(args)
  }, [])

  // 获取 agent-docs/task 目录树
  const taskTreeQuery = useFsTreeQuery({
    base: 'agent-docs',
    depth: 2,
    projectId,
    enabled: !!projectId
  })

  // 从目录树中提取 task 文件
  const taskFiles = useMemo(() => {
    const root = taskTreeQuery.data as FsTreeNode | null
    if (!root?.children) return []

    const taskDir = root.children.find(
      (child) => child?.dir && (child.name === 'task' || child.path?.endsWith('/task'))
    )
    if (!taskDir?.children) return []

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
          base: 'agent-docs',
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
        log.error('task-file-load-failed', err instanceof Error ? err : undefined, {
          projectId,
          filePath: file.path
        })
      }
    }

    setTasks(loadedTasks)
    setLoading(false)
  }, [projectId, taskFiles, log])

  // 文件变化时重新加载
  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  // 监听 task 目录文件变化
  useEffect(() => {
    if (!projectId) return undefined

    type DocsSubscribe = (
      opts: { projectId?: string },
      handler: (event: DocsWatcherEvent) => void
    ) => () => void
    const docsApi = (
      window as unknown as {
        api?: { docs?: { subscribe?: DocsSubscribe } }
      }
    ).api?.docs
    if (!docsApi?.subscribe) return undefined

    let scheduled = false
    const flush = () => {
      scheduled = false
      void loadTasks()
    }

    const unsubscribe = docsApi.subscribe({ projectId }, (event) => {
      if (event.kind === 'file' && event.path?.startsWith('task/')) {
        if (!scheduled) {
          scheduled = true
          queueMicrotask(flush)
        }
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [projectId, loadTasks])

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

  // 更新任务状态
  const updateTaskStatus = useCallback(
    async (task: Task, newStatus: TaskStatus) => {
      if (task.status === newStatus) return

      // 乐观更新
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)))

      try {
        const { content } = await fetchFile({
          base: 'agent-docs',
          path: task.filePath,
          projectId
        })

        const newContent = updateFrontmatter(content, 'status', newStatus)

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
          base: 'agent-docs',
          path: task.filePath,
          content: newContent,
          projectId
        })

        const columnLabel = columns.find((c) => c.id === newStatus)?.labelKey
        toast.success(
          t('workspace.kanban.movedTo', { column: columnLabel ? t(columnLabel) : newStatus })
        )
      } catch (err) {
        // 回滚
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)))
        toast.error(t('workspace.kanban.updateFailed'))
        log.error('task-status-update-failed', err instanceof Error ? err : undefined, {
          projectId,
          filePath: task.filePath,
          fromStatus: task.status,
          toStatus: newStatus
        })
      }
    },
    [projectId, t, log]
  )

  // 拖拽处理
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string
      const task = tasks.find((t) => t.id === id)
      setActiveId(id)
      setDragStartStatus(task?.status || null)
    },
    [tasks]
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over) return

      const activeId = active.id as string
      const overId = over.id as string

      if (activeId === overId) return

      const activeTask = tasks.find((t) => t.id === activeId)
      if (!activeTask) return

      const isOverColumn = overId.startsWith('column-')
      const overTask = isOverColumn ? null : tasks.find((t) => t.id === overId)

      let targetStatus: TaskStatus
      if (isOverColumn) {
        targetStatus = overId.replace('column-', '') as TaskStatus
      } else if (overTask) {
        targetStatus = overTask.status
      } else {
        return
      }

      if (activeTask.status !== targetStatus) {
        setTasks((prev) => {
          const newTasks = prev.filter((t) => t.id !== activeId)
          const updatedTask = { ...activeTask, status: targetStatus }

          if (overTask) {
            const overIndex = newTasks.findIndex((t) => t.id === overId)
            newTasks.splice(overIndex, 0, updatedTask)
          } else {
            newTasks.push(updatedTask)
          }

          return newTasks
        })
      } else if (overTask) {
        setTasks((prev) => {
          const oldIndex = prev.findIndex((t) => t.id === activeId)
          const newIndex = prev.findIndex((t) => t.id === overId)
          return arrayMove(prev, oldIndex, newIndex)
        })
      }
    },
    [tasks]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active } = event
      setActiveId(null)

      const activeId = active.id as string
      const activeTask = tasks.find((t) => t.id === activeId)

      if (activeTask && dragStartStatus && activeTask.status !== dragStartStatus) {
        void updateTaskStatus({ ...activeTask, status: dragStartStatus }, activeTask.status)
      }

      setDragStartStatus(null)
    },
    [tasks, dragStartStatus, updateTaskStatus]
  )

  // 在编辑器中打开文件
  const openInEditor = useCallback(
    (filePath: string) => {
      log.debug('open-in-editor', { projectId, filePath })
    },
    [projectId, log]
  )

  // 创建新任务
  const handleCreateTask = useCallback(
    (params: { prompt: string; status: TaskStatus; priority: TaskPriority; owner: string }) => {
      const fullPrompt = `请帮我在 agent-docs/task/ 目录下创建一个任务文档。

## 要求

1. **只操作文档**：只在 agent-docs/ 目录下创建或修改 Markdown 文件，**禁止修改任何代码文件**
2. **文件命名**：根据任务内容概括一个简短的英文或中文标题作为文件名（使用连字符连接）
3. **Frontmatter 格式**：
   \`\`\`yaml
   ---
   title: <根据任务内容概括的标题>
   status: ${params.status}
   priority: ${params.priority}${params.owner ? `\n   owner: ${params.owner}` : ''}
   ---
   \`\`\`
4. **文档结构**：包含任务描述、目标、待办事项、验收标准等章节

## 任务描述

${params.prompt}

---
请根据以上任务描述创建任务文档。记住：**只操作 agent-docs/ 下的文档，不要修改代码**。`

      setSelectedProjectId(projectId)
      setInitialPrompt(fullPrompt)
      openGlobalChat()
    },
    [projectId, setSelectedProjectId, setInitialPrompt, openGlobalChat]
  )

  // 检查任务完成状态
  const handleCheckTaskStatus = useCallback(
    (filePath: string) => {
      setSelectedProjectId(projectId)
      setInitialPrompt(`@${filePath} 请分析这个任务文档和当前代码库的实现情况，然后更新任务状态。

## 分析步骤

1. 阅读任务文档，理解目标和验收标准
2. 检查相关代码实现
3. 判断完成情况并更新 status 字段

## 输出要求

1. **只更新文档**：只修改 agent-docs/ 下的任务文档
2. **更新 frontmatter**：将 status 更新为最准确的值
3. **添加分析说明**：在文档中添加实现情况分析章节`)
      openGlobalChat()
    },
    [projectId, setSelectedProjectId, setInitialPrompt, openGlobalChat]
  )

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
          <NewTaskDialog projectId={projectId} onCreateTask={handleCreateTask} t={t} />
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
            <p className="text-xs">{t('workspace.kanban.emptyHint')}</p>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {tasks.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 gap-3 overflow-x-auto p-4">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={tasksByStatus[column.id] || []}
                activeId={activeId}
                onOpenFile={openInEditor}
                onChatWithFile={onChatWithFile}
                onCheckStatus={handleCheckTaskStatus}
                onTitleClick={handleTitleClick}
                onStatusChange={(task, newStatus) => void updateTaskStatus(task, newStatus)}
                t={t}
              />
            ))}
          </div>

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
