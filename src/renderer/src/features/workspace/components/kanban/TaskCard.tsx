/**
 * 可排序的任务卡片组件
 */

import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'motion/react'
import {
  MoreHorizontal,
  GripVertical,
  ExternalLink,
  MessageCircle,
  ClipboardCheck
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

import { type Task, type TaskStatus, columns, priorityConfig } from './types'

export interface TaskCardProps {
  task: Task
  isDragging?: boolean
  isOverlay?: boolean
  onOpenFile: (filePath: string) => void
  onChatWithFile?: (filePath: string) => void
  onCheckStatus?: (filePath: string) => void
  onTitleClick: (task: Task) => void
  onStatusChange: (task: Task, newStatus: TaskStatus) => void
  t: (key: string, options?: Record<string, string>) => string
}

export const SortableTaskCard = memo(function SortableTaskCard({
  task,
  isDragging,
  isOverlay,
  onOpenFile,
  onChatWithFile,
  onCheckStatus,
  onTitleClick,
  onStatusChange,
  t
}: TaskCardProps) {
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
      <div
        ref={setNodeRef}
        style={style}
        className="h-[72px] rounded-lg border-2 border-dashed border-primary/30 bg-primary/5"
      />
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
                !isOverlay &&
                  'hover:text-primary hover:underline underline-offset-2 cursor-pointer transition-colors'
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
                {onCheckStatus && (
                  <DropdownMenuItem onClick={() => onCheckStatus(task.filePath)}>
                    <ClipboardCheck className="mr-2 h-3.5 w-3.5" />
                    {t('workspace.kanban.checkStatus')}
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
})

/**
 * 任务卡片预览（用于 DragOverlay）
 */
export function TaskCardOverlay({
  task,
  t
}: {
  task: Task
  t: (key: string, options?: Record<string, string>) => string
}) {
  return (
    <SortableTaskCard
      task={task}
      isOverlay
      onOpenFile={() => {}}
      onChatWithFile={undefined}
      onCheckStatus={undefined}
      onTitleClick={() => {}}
      onStatusChange={() => {}}
      t={t}
    />
  )
}
