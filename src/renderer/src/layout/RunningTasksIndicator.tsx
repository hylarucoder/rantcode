import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Loader2, Square, ExternalLink } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRunningTasks, type RunningTask } from '@/shared/hooks/useRunningTasks'
import { useAppStore } from '@/state/app'

/** 格式化运行时长 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

/** 截断用户消息内容 */
function truncateContent(content: string, maxLength = 40): string {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength) + '...'
}

interface TaskItemProps {
  task: RunningTask
  onNavigate: () => void
  onInterrupt?: () => void
}

function TaskItem({ task, onNavigate, onInterrupt }: TaskItemProps) {
  const [duration, setDuration] = useState(task.duration)

  // 每秒更新运行时长
  useEffect(() => {
    const startedAt = task.message.startedAt
    if (!startedAt) return

    const updateDuration = () => {
      setDuration(Date.now() - startedAt)
    }

    updateDuration()
    const interval = setInterval(updateDuration, 1000)
    return () => clearInterval(interval)
  }, [task.message.startedAt])

  // 获取用户消息内容（如果有的话）
  const userContent = task.message.content || '执行中...'

  return (
    <div className="group flex items-start gap-2 rounded-md p-2 hover:bg-accent/50 transition-colors">
      {/* 运行指示器 */}
      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />

      {/* 任务信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium truncate">{task.sessionTitle}</span>
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
          {truncateContent(userContent)}
        </p>
        {task.message.runner && (
          <span className="inline-block mt-1 text-[10px] text-muted-foreground/50 bg-accent/50 px-1.5 py-0.5 rounded">
            {task.message.runner}
          </span>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation()
            onNavigate()
          }}
          title="跳转到会话"
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
        {onInterrupt && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onInterrupt()
            }}
            title="中断任务"
          >
            <Square className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * 运行任务指示器
 * 显示正在运行的任务数量，点击展开任务列表
 */
export function RunningTasksIndicator() {
  const tasks = useRunningTasks()
  const navigate = useNavigate()
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId)
  const [open, setOpen] = useState(false)

  // 没有运行中的任务时不显示
  if (tasks.length === 0) return null

  const handleNavigateToTask = (task: RunningTask) => {
    setActiveProjectId(task.projectId)
    navigate(`/project/${task.projectId}`)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors',
            'hover:bg-accent/50 cursor-pointer',
            'text-primary'
          )}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="tabular-nums">
            {tasks.length} 个任务运行中
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-80 p-2"
        sideOffset={8}
      >
        <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          运行中的任务
        </div>
        <div className="max-h-64 overflow-y-auto">
          {tasks.map((task) => (
            <TaskItem
              key={`${task.projectId}-${task.sessionId}-${task.message.id}`}
              task={task}
              onNavigate={() => handleNavigateToTask(task)}
              // TODO: 添加中断功能
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

