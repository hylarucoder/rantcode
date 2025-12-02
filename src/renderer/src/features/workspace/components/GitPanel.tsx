/**
 * Git 面板
 *
 * 显示 Git 状态和 diff 视图。
 * 逻辑已拆分到子组件和 utils 中。
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  RefreshCw,
  FileDiff,
  GitBranch,
  GitCommit,
  CheckCircle2,
  Loader2,
  ArrowUp,
  ArrowDown
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { orpc } from '@/lib/orpcQuery'
import { useGlobalChatStore } from '@/state/globalChat'
import { useProjectPreview } from '@/features/workspace/state/hooks/useProjectPreview'
import { useGitAutoRefresh } from '@/features/workspace/hooks/useGitAutoRefresh'

import { GitFileList, DiffView } from './git'

interface GitPanelProps {
  projectId: string
}

export function GitPanel({ projectId }: GitPanelProps) {
  const { t } = useTranslation()

  // 从 store 获取持久化状态
  const {
    gitSelectedFile: selectedFile,
    gitViewMode: viewMode,
    gitStagedExpanded: stagedExpanded,
    gitUnstagedExpanded: unstagedExpanded,
    setGitSelectedFile: setSelectedFile,
    setGitViewMode: setViewMode,
    setGitStagedExpanded: setStagedExpanded,
    setGitUnstagedExpanded: setUnstagedExpanded
  } = useProjectPreview(projectId)

  // 临时 UI 状态（不需要持久化）
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 全局聊天 store
  const { setInitialPrompt, setSelectedProjectId, open: openGlobalChat } = useGlobalChatStore()

  // 事件驱动的自动刷新（Runner 完成 + docs 变化时触发，带防抖）
  useGitAutoRefresh(projectId)

  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus
  } = useQuery({
    ...orpc.git.status.queryOptions({ input: { projectId } }),
    refetchOnWindowFocus: true
  })

  const { data: diff, isLoading: diffLoading } = useQuery({
    ...orpc.git.diff.queryOptions({
      input: {
        projectId,
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
  }, [status, selectedFile, setSelectedFile])

  const { staged, unstaged } = useMemo(() => {
    if (!status) return { staged: [], unstaged: [] }
    return {
      staged: status.files.filter((f) => f.staged),
      unstaged: status.files.filter((f) => !f.staged)
    }
  }, [status])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await refetchStatus()
    setTimeout(() => setIsRefreshing(false), 500)
  }, [refetchStatus])

  // 打开聊天面板进行 commit
  const handleCommit = useCallback(() => {
    setSelectedProjectId(projectId)
    setInitialPrompt('commit ')
    openGlobalChat()
  }, [projectId, setSelectedProjectId, setInitialPrompt, openGlobalChat])

  const handleToggleStaged = useCallback(() => {
    setStagedExpanded(!stagedExpanded)
  }, [stagedExpanded, setStagedExpanded])

  const handleToggleUnstaged = useCallback(() => {
    setUnstagedExpanded(!unstagedExpanded)
  }, [unstagedExpanded, setUnstagedExpanded])

  if (statusLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t('workspace.git.loading')}</p>
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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-accent"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 rounded-lg"
            onClick={handleCommit}
            disabled={!status?.files.length}
          >
            <GitCommit className="h-4 w-4" />
            {t('workspace.git.commit')}
          </Button>
        </div>
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
                    <p className="font-medium text-foreground">{t('workspace.git.clean')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('workspace.git.noChanges')}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <GitFileList
                    files={staged}
                    title={t('workspace.git.staged')}
                    expanded={stagedExpanded}
                    onToggle={handleToggleStaged}
                    accentColor="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    selectedFile={selectedFile}
                    onSelectFile={setSelectedFile}
                  />
                  <GitFileList
                    files={unstaged}
                    title={t('workspace.git.unstaged')}
                    expanded={unstagedExpanded}
                    onToggle={handleToggleUnstaged}
                    accentColor="bg-amber-500/20 text-amber-600 dark:text-amber-400"
                    selectedFile={selectedFile}
                    onSelectFile={setSelectedFile}
                  />
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
              t={t}
            />
          ) : diffLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('workspace.git.loadingDiff')}</p>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                <FileDiff className="h-7 w-7" />
              </div>
              <p className="text-sm">{t('workspace.git.selectFile')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
