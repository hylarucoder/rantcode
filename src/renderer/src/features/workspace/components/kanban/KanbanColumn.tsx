/**
 * 可放置的看板列组件
 */

import { memo, useMemo } from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'

import { type Task, type TaskStatus, columns } from './types'
import { SortableTaskCard } from './TaskCard'

interface KanbanColumnProps {
  column: (typeof columns)[number]
  tasks: Task[]
  activeId: string | null
  onOpenFile: (filePath: string) => void
  onChatWithFile?: (filePath: string) => void
  onCheckStatus?: (filePath: string) => void
  onTitleClick: (task: Task) => void
  onStatusChange: (task: Task, newStatus: TaskStatus) => void
  t: (key: string, options?: Record<string, string>) => string
}

export const KanbanColumn = memo(function KanbanColumn({
  column,
  tasks,
  activeId,
  onOpenFile,
  onChatWithFile,
  onCheckStatus,
  onTitleClick,
  onStatusChange,
  t
}: KanbanColumnProps) {
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])

  // 使列本身成为可放置目标（用于空列或拖到列底部）
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: 'column', status: column.id }
  })

  return (
    <motion.div
      ref={setDroppableRef}
      layout
      className={cn(
        'flex w-72 min-w-[288px] flex-col rounded-lg bg-muted/30 transition-colors',
        isOver && activeId && 'ring-2 ring-primary/50 ring-inset'
      )}
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
                onCheckStatus={onCheckStatus}
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
                'flex flex-1 min-h-[80px] items-center justify-center rounded-lg border-2 border-dashed transition-colors',
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
})
