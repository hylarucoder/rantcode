import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  RefreshCw,
  FileEdit,
  FilePlus,
  FileX,
  FileDiff,
  FileQuestion,
  GitBranch,
  CheckCircle2,
  Loader2,
  ArrowUp,
  ArrowDown,
  Rows3,
  Columns2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { orpc } from '@/lib/orpcQuery'

import type { z } from 'zod'
import type { gitFileStatusSchema, gitDiffSchema } from '@shared/orpc/schemas'

type GitFileStatus = z.infer<typeof gitFileStatusSchema>
type GitDiff = z.infer<typeof gitDiffSchema>
type DiffViewMode = 'unified' | 'split'

interface GitPanelProps {
  workspaceId: string
}

function getStatusIcon(status: GitFileStatus['status'], className?: string) {
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

function getStatusBadge(status: GitFileStatus['status']) {
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

interface ParsedLine {
  type: 'context' | 'addition' | 'deletion' | 'header' | 'meta-add' | 'meta-del'
  content: string
  oldLineNum?: number
  newLineNum?: number
}

function parseHunkLines(content: string): ParsedLine[] {
  const lines = content.split('\n')
  const result: ParsedLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Parse @@ -start,count +start,count @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = parseInt(match[1], 10)
        newLine = parseInt(match[2], 10)
      }
      result.push({ type: 'header', content: line })
    } else if (line.startsWith('+++')) {
      result.push({ type: 'meta-add', content: line })
    } else if (line.startsWith('---')) {
      result.push({ type: 'meta-del', content: line })
    } else if (line.startsWith('+')) {
      result.push({ type: 'addition', content: line.slice(1), newLineNum: newLine })
      newLine++
    } else if (line.startsWith('-')) {
      result.push({ type: 'deletion', content: line.slice(1), oldLineNum: oldLine })
      oldLine++
    } else {
      result.push({
        type: 'context',
        content: line.slice(1) || '',
        oldLineNum: oldLine,
        newLineNum: newLine
      })
      oldLine++
      newLine++
    }
  }

  return result
}

interface SplitLine {
  left: ParsedLine | null
  right: ParsedLine | null
}

function buildSplitLines(lines: ParsedLine[]): SplitLine[] {
  const result: SplitLine[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.type === 'header' || line.type === 'meta-add' || line.type === 'meta-del') {
      result.push({ left: line, right: line })
      i++
    } else if (line.type === 'context') {
      result.push({ left: line, right: line })
      i++
    } else if (line.type === 'deletion') {
      // Collect consecutive deletions
      const deletions: ParsedLine[] = []
      while (i < lines.length && lines[i].type === 'deletion') {
        deletions.push(lines[i])
        i++
      }
      // Collect consecutive additions
      const additions: ParsedLine[] = []
      while (i < lines.length && lines[i].type === 'addition') {
        additions.push(lines[i])
        i++
      }
      // Pair them up
      const maxLen = Math.max(deletions.length, additions.length)
      for (let j = 0; j < maxLen; j++) {
        result.push({
          left: deletions[j] || null,
          right: additions[j] || null
        })
      }
    } else if (line.type === 'addition') {
      result.push({ left: null, right: line })
      i++
    } else {
      i++
    }
  }

  return result
}

function UnifiedDiffView({ diff, file }: { diff: GitDiff; file: string }) {
  const fileData = diff.files.find((f) => f.path === file)

  if (!fileData || fileData.hunks.length === 0) {
    return null
  }

  return (
    <>
      {fileData.hunks.map((hunk, i) => {
        const lines = parseHunkLines(hunk.content)
        return (
          <div
            key={i}
            className="mb-4 overflow-hidden rounded-lg border border-border/50 bg-card/30"
          >
            {lines.map((line, j) => (
              <div
                key={j}
                className={cn(
                  'flex font-mono text-[13px] leading-6',
                  line.type === 'header' && 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
                  line.type === 'addition' &&
                    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                  line.type === 'deletion' && 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
                  line.type === 'meta-add' &&
                    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
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
            ))}
          </div>
        )
      })}
    </>
  )
}

function SplitDiffView({ diff, file }: { diff: GitDiff; file: string }) {
  const fileData = diff.files.find((f) => f.path === file)

  if (!fileData || fileData.hunks.length === 0) {
    return null
  }

  return (
    <>
      {fileData.hunks.map((hunk, i) => {
        const lines = parseHunkLines(hunk.content)
        const splitLines = buildSplitLines(lines)

        return (
          <div
            key={i}
            className="mb-4 overflow-hidden rounded-lg border border-border/50 bg-card/30"
          >
            {splitLines.map((row, j) => {
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
                      {row.left?.type === 'deletion'
                        ? '-'
                        : row.left?.type === 'context'
                          ? ' '
                          : ''}
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
        )
      })}
    </>
  )
}

function DiffView({
  diff,
  file,
  viewMode,
  onViewModeChange
}: {
  diff: GitDiff
  file: string
  viewMode: DiffViewMode
  onViewModeChange: (mode: DiffViewMode) => void
}) {
  const fileData = diff.files.find((f) => f.path === file)

  if (!fileData || fileData.hunks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
          <FileDiff className="h-6 w-6" />
        </div>
        <p className="text-sm">没有差异内容</p>
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
}

export function GitPanel({ workspaceId }: GitPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [stagedExpanded, setStagedExpanded] = useState(true)
  const [unstagedExpanded, setUnstagedExpanded] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified')

  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus
  } = useQuery({
    ...orpc.git.status.queryOptions({ input: { workspaceId } }),
    refetchInterval: 5000
  })

  const { data: diff, isLoading: diffLoading } = useQuery({
    ...orpc.git.diff.queryOptions({
      input: {
        workspaceId,
        path: selectedFile ?? undefined
      }
    }),
    enabled: !!selectedFile
  })

  // Auto-select first file
  useEffect(() => {
    if (!selectedFile && status?.files.length) {
      setSelectedFile(status.files[0].path)
    }
  }, [status, selectedFile])

  const { staged, unstaged } = useMemo(() => {
    if (!status) return { staged: [], unstaged: [] }
    return {
      staged: status.files.filter((f) => f.staged),
      unstaged: status.files.filter((f) => !f.staged)
    }
  }, [status])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetchStatus()
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const renderFileList = (
    files: GitFileStatus[],
    title: string,
    expanded: boolean,
    onToggle: () => void,
    accentColor: string
  ) => {
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
          <span
            className={cn('ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold', accentColor)}
          >
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
                onClick={() => setSelectedFile(file.path)}
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
  }

  if (statusLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">加载 Git 状态...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 bg-card/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <GitBranch className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{status?.branch || 'HEAD'}</span>
            {status?.ahead || status?.behind ? (
              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {status?.ahead ? (
                  <span className="flex items-center gap-0.5 text-emerald-500">
                    <ArrowUp className="h-3 w-3" />
                    {status.ahead}
                  </span>
                ) : null}
                {status?.behind ? (
                  <span className="flex items-center gap-0.5 text-amber-500">
                    <ArrowDown className="h-3 w-3" />
                    {status.behind}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-accent"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1">
        {/* File list */}
        <div className="w-72 shrink-0 border-r border-border/50 bg-card/20">
          <ScrollArea className="h-full">
            <div className="p-3">
              {status?.files.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                    <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground">工作区干净</p>
                    <p className="mt-1 text-xs text-muted-foreground">没有待提交的更改</p>
                  </div>
                </div>
              ) : (
                <>
                  {renderFileList(
                    staged,
                    '已暂存',
                    stagedExpanded,
                    () => setStagedExpanded(!stagedExpanded),
                    'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  )}
                  {renderFileList(
                    unstaged,
                    '未暂存',
                    unstagedExpanded,
                    () => setUnstagedExpanded(!unstagedExpanded),
                    'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Diff view */}
        <div className="min-w-0 flex-1 bg-background/30">
          {selectedFile && diff ? (
            <DiffView
              diff={diff}
              file={selectedFile}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          ) : diffLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">加载差异...</p>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                <FileDiff className="h-7 w-7" />
              </div>
              <p className="text-sm">选择一个文件查看差异</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
