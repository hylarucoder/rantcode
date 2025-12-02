import { useEffect } from 'react'
import type { RightPanelTab } from '@/features/workspace/types'
import { useProjectPreviewStore } from '../previewStore'

// 从 ActivityBar 导入 ActivityView 类型
type ActivityView = 'kanban' | 'docs' | 'git' | 'settings'

export function useProjectPreview(projectId: string) {
  const selectedDocPath = useProjectPreviewStore(
    (s) => s.projects[projectId]?.selectedDocPath ?? null
  )
  const rightTab = useProjectPreviewStore((s) => s.projects[projectId]?.rightTab ?? 'preview')
  const previewTocOpen = useProjectPreviewStore(
    (s) => s.projects[projectId]?.previewTocOpen ?? false
  )
  const activeView = useProjectPreviewStore((s) => s.projects[projectId]?.activeView ?? 'docs')
  // Sessions/Assistants 面板状态
  const chatPanelTab = useProjectPreviewStore(
    (s) => s.projects[projectId]?.chatPanelTab ?? 'sessions'
  )
  const showArchivedSessions = useProjectPreviewStore(
    (s) => s.projects[projectId]?.showArchivedSessions ?? false
  )
  // Git 面板状态
  const gitSelectedFile = useProjectPreviewStore(
    (s) => s.projects[projectId]?.gitSelectedFile ?? null
  )
  const gitViewMode = useProjectPreviewStore((s) => s.projects[projectId]?.gitViewMode ?? 'unified')
  const gitStagedExpanded = useProjectPreviewStore(
    (s) => s.projects[projectId]?.gitStagedExpanded ?? true
  )
  const gitUnstagedExpanded = useProjectPreviewStore(
    (s) => s.projects[projectId]?.gitUnstagedExpanded ?? true
  )

  const setSelectedDocPath = useProjectPreviewStore((s) => s.setSelectedDocPath)
  const setRightTab = useProjectPreviewStore((s) => s.setRightTab)
  const setPreviewTocOpen = useProjectPreviewStore((s) => s.setPreviewTocOpen)
  const setActiveView = useProjectPreviewStore((s) => s.setActiveView)
  const setChatPanelTab = useProjectPreviewStore((s) => s.setChatPanelTab)
  const setShowArchivedSessions = useProjectPreviewStore((s) => s.setShowArchivedSessions)
  const setGitSelectedFile = useProjectPreviewStore((s) => s.setGitSelectedFile)
  const setGitViewMode = useProjectPreviewStore((s) => s.setGitViewMode)
  const setGitStagedExpanded = useProjectPreviewStore((s) => s.setGitStagedExpanded)
  const setGitUnstagedExpanded = useProjectPreviewStore((s) => s.setGitUnstagedExpanded)
  const ensure = useProjectPreviewStore((s) => s.ensure)

  useEffect(() => {
    ensure(projectId)
  }, [projectId, ensure])

  return {
    selectedDocPath,
    rightTab,
    previewTocOpen,
    activeView,
    chatPanelTab,
    showArchivedSessions,
    gitSelectedFile,
    gitViewMode,
    gitStagedExpanded,
    gitUnstagedExpanded,
    setSelectedDocPath: (path: string | null) => setSelectedDocPath(projectId, path),
    setRightTab: (tab: RightPanelTab) => setRightTab(projectId, tab),
    setPreviewTocOpen: (open: boolean) => setPreviewTocOpen(projectId, open),
    setActiveView: (view: ActivityView) => setActiveView(projectId, view),
    setChatPanelTab: (tab: 'sessions' | 'assistants') => setChatPanelTab(projectId, tab),
    setShowArchivedSessions: (show: boolean) => setShowArchivedSessions(projectId, show),
    setGitSelectedFile: (file: string | null) => setGitSelectedFile(projectId, file),
    setGitViewMode: (mode: 'unified' | 'split') => setGitViewMode(projectId, mode),
    setGitStagedExpanded: (expanded: boolean) => setGitStagedExpanded(projectId, expanded),
    setGitUnstagedExpanded: (expanded: boolean) => setGitUnstagedExpanded(projectId, expanded)
  }
}
