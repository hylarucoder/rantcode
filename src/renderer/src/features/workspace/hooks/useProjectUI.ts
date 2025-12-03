import { useEffect } from 'react'
import type { RightPanelTab, ActivityView } from '@/features/workspace/types'
import { useProjectUIStore } from '../state/uiStore'

export function useProjectUI(projectId: string) {
  const selectedDocPath = useProjectUIStore((s) => s.projects[projectId]?.selectedDocPath ?? null)
  const rightTab = useProjectUIStore((s) => s.projects[projectId]?.rightTab ?? 'preview')
  const previewTocOpen = useProjectUIStore((s) => s.projects[projectId]?.previewTocOpen ?? false)
  const activeView = useProjectUIStore((s) => s.projects[projectId]?.activeView ?? 'docs')
  // Sessions/Assistants 面板状态
  const chatPanelTab = useProjectUIStore((s) => s.projects[projectId]?.chatPanelTab ?? 'sessions')
  const showArchivedSessions = useProjectUIStore(
    (s) => s.projects[projectId]?.showArchivedSessions ?? false
  )
  // Git 面板状态
  const gitSelectedFile = useProjectUIStore((s) => s.projects[projectId]?.gitSelectedFile ?? null)
  const gitViewMode = useProjectUIStore((s) => s.projects[projectId]?.gitViewMode ?? 'unified')
  const gitStagedExpanded = useProjectUIStore(
    (s) => s.projects[projectId]?.gitStagedExpanded ?? true
  )
  const gitUnstagedExpanded = useProjectUIStore(
    (s) => s.projects[projectId]?.gitUnstagedExpanded ?? true
  )

  const setSelectedDocPath = useProjectUIStore((s) => s.setSelectedDocPath)
  const setRightTab = useProjectUIStore((s) => s.setRightTab)
  const setPreviewTocOpen = useProjectUIStore((s) => s.setPreviewTocOpen)
  const setActiveView = useProjectUIStore((s) => s.setActiveView)
  const setChatPanelTab = useProjectUIStore((s) => s.setChatPanelTab)
  const setShowArchivedSessions = useProjectUIStore((s) => s.setShowArchivedSessions)
  const setGitSelectedFile = useProjectUIStore((s) => s.setGitSelectedFile)
  const setGitViewMode = useProjectUIStore((s) => s.setGitViewMode)
  const setGitStagedExpanded = useProjectUIStore((s) => s.setGitStagedExpanded)
  const setGitUnstagedExpanded = useProjectUIStore((s) => s.setGitUnstagedExpanded)
  const ensure = useProjectUIStore((s) => s.ensure)

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

