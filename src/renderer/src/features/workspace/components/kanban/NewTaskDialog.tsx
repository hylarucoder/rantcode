/**
 * 新建任务对话框
 */

import { memo, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'

import { type TaskStatus, type TaskPriority, columns, priorityConfig } from './types'

interface NewTaskDialogProps {
  projectId: string
  onCreateTask: (params: {
    prompt: string
    status: TaskStatus
    priority: TaskPriority
    owner: string
  }) => void
  t: (key: string, options?: Record<string, string>) => string
}

export const NewTaskDialog = memo(function NewTaskDialog({ onCreateTask, t }: NewTaskDialogProps) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<TaskStatus>('backlog')
  const [priority, setPriority] = useState<TaskPriority>('P2')
  const [owner, setOwner] = useState('')

  const resetForm = useCallback(() => {
    setPrompt('')
    setStatus('backlog')
    setPriority('P2')
    setOwner('')
  }, [])

  const handleSubmit = useCallback(() => {
    if (!prompt.trim()) {
      toast.error(t('workspace.kanban.newTask.promptRequired'))
      return
    }

    onCreateTask({
      prompt: prompt.trim(),
      status,
      priority,
      owner: owner.trim()
    })

    setOpen(false)
    resetForm()
  }, [prompt, status, priority, owner, onCreateTask, t, resetForm])

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) resetForm()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          {t('workspace.kanban.newTask.button')}
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('workspace.kanban.newTask.title')}</DialogTitle>
          <DialogDescription>{t('workspace.kanban.newTask.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* 任务提示词 */}
          <div className="grid gap-2">
            <label htmlFor="task-prompt" className="text-sm font-medium">
              {t('workspace.kanban.newTask.prompt')}
            </label>
            <Textarea
              id="task-prompt"
              placeholder={t('workspace.kanban.newTask.promptPlaceholder')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {t('workspace.kanban.newTask.promptHint')}
            </p>
          </div>

          {/* 初始状态 */}
          <div className="grid gap-2">
            <label className="text-sm font-medium">{t('workspace.kanban.newTask.status')}</label>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col.id} value={col.id}>
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', col.color)} />
                      {t(col.labelKey)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 优先级 */}
          <div className="grid gap-2">
            <label className="text-sm font-medium">{t('workspace.kanban.newTask.priority')}</label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['P0', 'P1', 'P2'] as const).map((p) => (
                  <SelectItem key={p} value={p}>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-xs font-semibold',
                        priorityConfig[p].color
                      )}
                    >
                      {priorityConfig[p].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 负责人 */}
          <div className="grid gap-2">
            <label htmlFor="task-owner" className="text-sm font-medium">
              {t('workspace.kanban.newTask.owner')}
              <span className="ml-1 text-muted-foreground text-xs">
                {t('common.label.optional')}
              </span>
            </label>
            <Input
              id="task-owner"
              placeholder={t('workspace.kanban.newTask.ownerPlaceholder')}
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('common.button.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!prompt.trim()}>
            {t('workspace.kanban.newTask.sendToChat')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
