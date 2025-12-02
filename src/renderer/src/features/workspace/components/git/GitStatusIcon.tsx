/**
 * Git 文件状态图标和徽章
 */

import { FileEdit, FilePlus, FileX, FileDiff, FileQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'

import type { z } from 'zod'
import type { gitFileStatusSchema } from '@shared/orpc/schemas'

type GitFileStatus = z.infer<typeof gitFileStatusSchema>

export function getStatusIcon(status: GitFileStatus['status'], className?: string) {
  const baseClass = cn('h-4 w-4 shrink-0', className)
  switch (status) {
    case 'modified':
      return <FileEdit className={cn(baseClass, 'text-amber-500')} />
    case 'added':
      return <FilePlus className={cn(baseClass, 'text-emerald-500')} />
    case 'deleted':
      return <FileX className={cn(baseClass, 'text-rose-500')} />
    case 'renamed':
    case 'copied':
      return <FileDiff className={cn(baseClass, 'text-sky-500')} />
    case 'untracked':
      return <FileQuestion className={cn(baseClass, 'text-slate-400')} />
    case 'unmerged':
      return <FileDiff className={cn(baseClass, 'text-violet-500')} />
    default:
      return <FileEdit className={baseClass} />
  }
}

export function getStatusBadge(status: GitFileStatus['status']) {
  const base = 'inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold'
  switch (status) {
    case 'modified':
      return (
        <span className={cn(base, 'bg-amber-500/20 text-amber-600 dark:text-amber-400')}>M</span>
      )
    case 'added':
      return (
        <span className={cn(base, 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400')}>
          A
        </span>
      )
    case 'deleted':
      return <span className={cn(base, 'bg-rose-500/20 text-rose-600 dark:text-rose-400')}>D</span>
    case 'renamed':
      return <span className={cn(base, 'bg-sky-500/20 text-sky-600 dark:text-sky-400')}>R</span>
    case 'copied':
      return <span className={cn(base, 'bg-sky-500/20 text-sky-600 dark:text-sky-400')}>C</span>
    case 'untracked':
      return <span className={cn(base, 'bg-slate-500/20 text-slate-500')}>?</span>
    case 'unmerged':
      return (
        <span className={cn(base, 'bg-violet-500/20 text-violet-600 dark:text-violet-400')}>U</span>
      )
    default:
      return null
  }
}
