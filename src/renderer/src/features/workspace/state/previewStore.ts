import { create } from 'zustand'
import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { RightPanelTab } from '@/features/workspace/types'

// 从 ActivityBar 导入 ActivityView 类型
type ActivityView = 'kanban' | 'docs' | 'git' | 'settings'

export type PreviewProjectState = {
  selectedDocPath: string | null
  rightTab: RightPanelTab
  previewTocOpen: boolean
  activeView: ActivityView
  // Sessions/Assistants 面板状态
  chatPanelTab: 'sessions' | 'assistants'
  showArchivedSessions: boolean
  // Git 面板状态
  gitSelectedFile: string | null
  gitViewMode: 'unified' | 'split'
  gitStagedExpanded: boolean
  gitUnstagedExpanded: boolean
}

export interface PreviewStoreState {
  projects: Record<string, PreviewProjectState>
  ensure: (projectId: string, initializer?: () => Partial<PreviewProjectState>) => void
  setSelectedDocPath: (projectId: string, path: string | null) => void
  setRightTab: (projectId: string, tab: RightPanelTab) => void
  setPreviewTocOpen: (projectId: string, open: boolean) => void
  setActiveView: (projectId: string, view: ActivityView) => void
  // Sessions/Assistants 面板
  setChatPanelTab: (projectId: string, tab: 'sessions' | 'assistants') => void
  setShowArchivedSessions: (projectId: string, show: boolean) => void
  // Git 面板
  setGitSelectedFile: (projectId: string, file: string | null) => void
  setGitViewMode: (projectId: string, mode: 'unified' | 'split') => void
  setGitStagedExpanded: (projectId: string, expanded: boolean) => void
  setGitUnstagedExpanded: (projectId: string, expanded: boolean) => void
  reset: (projectId: string) => void
}

export const defaultPreviewProjectState = (): PreviewProjectState => ({
  selectedDocPath: null,
  rightTab: 'preview',
  previewTocOpen: false,
  activeView: 'docs',
  // Sessions/Assistants 面板状态
  chatPanelTab: 'sessions',
  showArchivedSessions: false,
  // Git 面板状态
  gitSelectedFile: null,
  gitViewMode: 'unified',
  gitStagedExpanded: true,
  gitUnstagedExpanded: true
})

export const useProjectPreviewStore = create<PreviewStoreState>()(
  persist(
    subscribeWithSelector(
      immer<PreviewStoreState>((set) => ({
        projects: {},
        ensure: (projectId, initializer) =>
          set((state) => {
            const current = state.projects[projectId]
            if (current) {
              if (!initializer) return
              const patch = initializer() ?? {}
              Object.assign(current, patch)
              return
            }
            const initial = { ...defaultPreviewProjectState(), ...(initializer?.() ?? {}) }
            state.projects[projectId] = initial
          }),
        setSelectedDocPath: (projectId, path) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.selectedDocPath = path
          }),
        setRightTab: (projectId, tab) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.rightTab = tab
          }),
        setPreviewTocOpen: (projectId, open) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.previewTocOpen = open
          }),
        setActiveView: (projectId, view) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.activeView = view
          }),
        // Sessions/Assistants 面板
        setChatPanelTab: (projectId, tab) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.chatPanelTab = tab
          }),
        setShowArchivedSessions: (projectId, show) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.showArchivedSessions = show
          }),
        // Git 面板
        setGitSelectedFile: (projectId, file) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.gitSelectedFile = file
          }),
        setGitViewMode: (projectId, mode) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.gitViewMode = mode
          }),
        setGitStagedExpanded: (projectId, expanded) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.gitStagedExpanded = expanded
          }),
        setGitUnstagedExpanded: (projectId, expanded) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.gitUnstagedExpanded = expanded
          }),
        reset: (projectId) =>
          set((state) => {
            delete state.projects[projectId]
          })
      }))
    ),
    {
      name: 'rantcode.workspace.preview',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ projects: state.projects })
    }
  )
)
