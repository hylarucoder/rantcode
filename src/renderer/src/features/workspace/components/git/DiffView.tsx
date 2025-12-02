/**
 * Git Diff 视图组件
 *
 * 支持 unified 和 split 两种视图模式。
 */

import { memo, useMemo } from 'react'
import { FileDiff, Rows3, Columns2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  parseHunkLinesWithCache,
  buildSplitLinesWithCache,
  type ParsedLine
} from '../../utils/diffParser'

import type { z } from 'zod'
import type { gitDiffSchema } from '@shared/orpc/schemas'

type GitDiff = z.infer<typeof gitDiffSchema>
type DiffViewMode = 'unified' | 'split'

// ============ Unified Diff View ============

interface UnifiedDiffViewProps {
  diff: GitDiff
  file: string
}

const UnifiedDiffView = memo(function UnifiedDiffView({ diff, file }: UnifiedDiffViewProps) {
  const fileData = diff.files.find((f) => f.path === file)

  const parsedHunks = useMemo(() => {
    if (!fileData) return []
    return fileData.hunks.map((hunk) => ({
      lines: parseHunkLinesWithCache(hunk.content)
    }))
  }, [fileData])

  if (!fileData || fileData.hunks.length === 0) {
    return null
  }

  return (
    <>
      {parsedHunks.map((hunk, i) => (
        <div key={i} className="mb-4 overflow-hidden rounded-lg border border-border/50 bg-card/30">
          {hunk.lines.map((line, j) => (
            <DiffLine key={j} line={line} />
          ))}
        </div>
      ))}
    </>
  )
})

// ============ Split Diff View ============

interface SplitDiffViewProps {
  diff: GitDiff
  file: string
}

const SplitDiffView = memo(function SplitDiffView({ diff, file }: SplitDiffViewProps) {
  const fileData = diff.files.find((f) => f.path === file)

  const parsedHunks = useMemo(() => {
    if (!fileData) return []
    return fileData.hunks.map((hunk) => ({
      splitLines: buildSplitLinesWithCache(hunk.content)
    }))
  }, [fileData])

  if (!fileData || fileData.hunks.length === 0) {
    return null
  }

  return (
    <>
      {parsedHunks.map((hunk, i) => (
        <div key={i} className="mb-4 overflow-hidden rounded-lg border border-border/50 bg-card/30">
          {hunk.splitLines.map((row, j) => {
            // Header rows span both columns
            if (row.left?.type === 'header') {
              return (
                <div
                  key={j}
                  className="flex bg-sky-500/10 font-mono text-[13px] leading-6 text-sky-600 dark:text-sky-400"
                >
                  <pre className="flex-1 whitespace-pre overflow-x-auto px-3">
                    {row.left.content}
                  </pre>
                </div>
              )
            }

            // Meta rows span both columns
            if (row.left?.type === 'meta-add' || row.left?.type === 'meta-del') {
              return (
                <div
                  key={j}
                  className={cn(
                    'flex font-mono text-[13px] leading-6',
                    row.left.type === 'meta-add' &&
                      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    row.left.type === 'meta-del' &&
                      'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  )}
                >
                  <pre className="flex-1 whitespace-pre overflow-x-auto px-3">
                    {row.left.content}
                  </pre>
                </div>
              )
            }

            return (
              <div key={j} className="flex font-mono text-[13px] leading-6">
                {/* Left side (old) */}
                <div
                  className={cn(
                    'flex w-1/2 border-r border-border/50',
                    row.left?.type === 'deletion' && 'bg-rose-500/15',
                    row.left?.type === 'context' && 'bg-transparent',
                    !row.left && 'bg-muted/20'
                  )}
                >
                  <span className="w-10 shrink-0 select-none border-r border-border/30 px-1 text-right text-[11px] leading-6 text-muted-foreground/50">
                    {row.left?.oldLineNum ?? ''}
                  </span>
                  <span
                    className={cn(
                      'w-5 shrink-0 select-none text-center text-xs leading-6',
                      row.left?.type === 'deletion' && 'text-rose-600 dark:text-rose-400',
                      row.left?.type === 'context' && 'text-muted-foreground/30'
                    )}
                  >
                    {row.left?.type === 'deletion' ? '-' : row.left?.type === 'context' ? ' ' : ''}
                  </span>
                  <pre
                    className={cn(
                      'flex-1 whitespace-pre overflow-x-auto px-2',
                      row.left?.type === 'deletion' && 'text-rose-700 dark:text-rose-300',
                      row.left?.type === 'context' && 'text-foreground/80'
                    )}
                  >
                    {row.left?.content ?? ' '}
                  </pre>
                </div>

                {/* Right side (new) */}
                <div
                  className={cn(
                    'flex w-1/2',
                    row.right?.type === 'addition' && 'bg-emerald-500/15',
                    row.right?.type === 'context' && 'bg-transparent',
                    !row.right && 'bg-muted/20'
                  )}
                >
                  <span className="w-10 shrink-0 select-none border-r border-border/30 px-1 text-right text-[11px] leading-6 text-muted-foreground/50">
                    {row.right?.newLineNum ?? ''}
                  </span>
                  <span
                    className={cn(
                      'w-5 shrink-0 select-none text-center text-xs leading-6',
                      row.right?.type === 'addition' && 'text-emerald-600 dark:text-emerald-400',
                      row.right?.type === 'context' && 'text-muted-foreground/30'
                    )}
                  >
                    {row.right?.type === 'addition'
                      ? '+'
                      : row.right?.type === 'context'
                        ? ' '
                        : ''}
                  </span>
                  <pre
                    className={cn(
                      'flex-1 whitespace-pre overflow-x-auto px-2',
                      row.right?.type === 'addition' && 'text-emerald-700 dark:text-emerald-300',
                      row.right?.type === 'context' && 'text-foreground/80'
                    )}
                  >
                    {row.right?.content ?? ' '}
                  </pre>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
})

// ============ Diff Line Component ============

interface DiffLineProps {
  line: ParsedLine
}

const DiffLine = memo(function DiffLine({ line }: DiffLineProps) {
  return (
    <div
      className={cn(
        'flex font-mono text-[13px] leading-6',
        line.type === 'header' && 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
        line.type === 'addition' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        line.type === 'deletion' && 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
        line.type === 'meta-add' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        line.type === 'meta-del' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        line.type === 'context' && 'text-foreground/80'
      )}
    >
      {/* Line numbers */}
      <span className="w-12 shrink-0 select-none border-r border-border/30 px-1 text-right text-[11px] leading-6 text-muted-foreground/50">
        {line.oldLineNum ?? ''}
      </span>
      <span className="w-12 shrink-0 select-none border-r border-border/30 px-1 text-right text-[11px] leading-6 text-muted-foreground/50">
        {line.newLineNum ?? ''}
      </span>
      {/* Indicator */}
      <span
        className={cn(
          'w-6 shrink-0 select-none text-center text-xs leading-6',
          line.type === 'addition' && 'text-emerald-600 dark:text-emerald-400',
          line.type === 'deletion' && 'text-rose-600 dark:text-rose-400',
          line.type === 'context' && 'text-muted-foreground/30'
        )}
      >
        {line.type === 'addition'
          ? '+'
          : line.type === 'deletion'
            ? '-'
            : line.type === 'context'
              ? ' '
              : ''}
      </span>
      {/* Content */}
      <pre className="flex-1 whitespace-pre overflow-x-auto px-2">
        {line.type === 'header' || line.type === 'meta-add' || line.type === 'meta-del'
          ? line.content
          : line.content || ' '}
      </pre>
    </div>
  )
})

// ============ Main DiffView Component ============

interface DiffViewProps {
  diff: GitDiff
  file: string
  viewMode: DiffViewMode
  onViewModeChange: (mode: DiffViewMode) => void
  t: (key: string) => string
}

export const DiffView = memo(function DiffView({
  diff,
  file,
  viewMode,
  onViewModeChange,
  t
}: DiffViewProps) {
  const fileData = diff.files.find((f) => f.path === file)

  if (!fileData || fileData.hunks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
          <FileDiff className="h-6 w-6" />
        </div>
        <p className="text-sm">{t('workspace.git.noDiff')}</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        {/* File header */}
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 px-4 py-3">
          <span className="font-mono text-sm font-medium text-foreground">{file}</span>
          <div className="ml-auto flex items-center gap-3">
            {/* Stats */}
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-500">
                <span className="font-mono font-bold">+{fileData.additions}</span>
              </span>
              <span className="flex items-center gap-1 text-rose-500">
                <span className="font-mono font-bold">-{fileData.deletions}</span>
              </span>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 gap-1.5 rounded-md px-2.5 text-xs',
                  viewMode === 'unified'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => onViewModeChange('unified')}
              >
                <Rows3 className="h-3.5 w-3.5" />
                Unified
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 gap-1.5 rounded-md px-2.5 text-xs',
                  viewMode === 'split'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => onViewModeChange('split')}
              >
                <Columns2 className="h-3.5 w-3.5" />
                Split
              </Button>
            </div>
          </div>
        </div>

        {/* Diff content */}
        {viewMode === 'unified' ? (
          <UnifiedDiffView diff={diff} file={file} />
        ) : (
          <SplitDiffView diff={diff} file={file} />
        )}
      </div>
    </ScrollArea>
  )
})
