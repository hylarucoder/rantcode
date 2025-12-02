/**
 * Git 文件列表组件
 */

import { memo } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getStatusIcon, getStatusBadge } from './GitStatusIcon'

import type { z } from 'zod'
import type { gitFileStatusSchema } from '@shared/orpc/schemas'

type GitFileStatus = z.infer<typeof gitFileStatusSchema>

interface GitFileListProps {
  files: GitFileStatus[]
  title: string
  expanded: boolean
  onToggle: () => void
  accentColor: string
  selectedFile: string | null
  onSelectFile: (path: string) => void
}

export const GitFileList = memo(function GitFileList({
  files,
  title,
  expanded,
  onToggle,
  accentColor,
  selectedFile,
  onSelectFile
}: GitFileListProps) {
  if (files.length === 0) return null

  return (
    <div className="mb-3">
      <button
        type="button"
        className="group flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        onClick={onToggle}
      >
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded transition-transform duration-200',
            expanded && 'rotate-0',
            !expanded && '-rotate-90'
          )}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
        <span>{title}</span>
        <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold', accentColor)}>
          {files.length}
        </span>
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          expanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="mt-1 space-y-0.5 pl-2">
          {files.map((file, index) => (
            <button
              key={file.path}
              type="button"
              className={cn(
                'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-150',
                selectedFile === file.path
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-foreground/70 hover:bg-accent/40 hover:text-foreground'
              )}
              onClick={() => onSelectFile(file.path)}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              {getStatusIcon(file.status)}
              <span className="flex-1 truncate font-mono text-xs">{file.path}</span>
              {getStatusBadge(file.status)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
})
