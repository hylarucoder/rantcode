import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/lib/orpcQuery'
import { create } from 'zustand'
import type { DocsWatcherEvent } from '@shared/types/webui'

const DEFAULT_PROJECT_KEY = '__default__'

function normalizeProjectId(projectId?: string): string | undefined {
  const trimmed = projectId?.trim()
  if (!trimmed || trimmed.length === 0) {
    return undefined
  }
  return trimmed
}

function toProjectKey(projectId?: string): string {
  return normalizeProjectId(projectId) ?? DEFAULT_PROJECT_KEY
}

function toDocKey(projectId: string | undefined, path?: string | null): string | null {
  if (!path) return null
  return `${toProjectKey(projectId)}::${path}`
}

interface DocumentEntry {
  projectId?: string
  path: string
  content?: string
  updatedAt?: number
}

interface ProjectStatus {
  ready: boolean
  error?: string
}

interface DocsWatcherState {
  files: Record<string, DocumentEntry>
  statuses: Record<string, ProjectStatus>
  handleEvent: (event: DocsWatcherEvent) => void
  setInitialContent: (projectId: string | undefined, path: string, content?: string) => void
  clearProject: (projectId: string | undefined) => void
}

export const useDocsStore = create<DocsWatcherState>((set) => ({
  files: {},
  statuses: {},
  handleEvent: (event) =>
    set((state) => {
      const projectKey = toProjectKey(event.projectId)
      if (event.kind === 'ready') {
        return {
          ...state,
          statuses: {
            ...state.statuses,
            [projectKey]: { ready: true }
          }
        }
      }

      if (event.kind === 'error') {
        return {
          ...state,
          statuses: {
            ...state.statuses,
            [projectKey]: { ready: false, error: event.message }
          }
        }
      }

      const docKey = toDocKey(event.projectId, event.path)
      if (!docKey) {
        return state
      }

      if (event.changeType === 'unlink') {
        if (!state.files[docKey]) {
          return state
        }
        const nextFiles = { ...state.files }
        delete nextFiles[docKey]
        return { ...state, files: nextFiles }
      }

      const prevEntry = state.files[docKey]
      const nextContent = typeof event.content === 'string' ? event.content : prevEntry?.content
      const nextUpdatedAt = event.updatedAt ?? prevEntry?.updatedAt
      if (prevEntry && prevEntry.content === nextContent && prevEntry.updatedAt === nextUpdatedAt) {
        return state
      }

      return {
        ...state,
        files: {
          ...state.files,
          [docKey]: {
            projectId: event.projectId,
            path: event.path,
            content: nextContent,
            updatedAt: nextUpdatedAt
          }
        },
        statuses: {
          ...state.statuses,
          [projectKey]: { ready: true }
        }
      }
    }),
  setInitialContent: (projectId, path, content) =>
    set((state) => {
      if (typeof content !== 'string') {
        return state
      }
      const docKey = toDocKey(projectId, path)
      if (!docKey) {
        return state
      }
      return {
        ...state,
        files: {
          ...state.files,
          [docKey]: {
            projectId,
            path,
            content,
            updatedAt: Date.now()
          }
        },
        statuses: {
          ...state.statuses,
          [toProjectKey(projectId)]: { ready: true }
        }
      }
    }),
  clearProject: (projectId) =>
    set((state) => {
      const projectKey = toProjectKey(projectId)
      const hasFiles = Object.keys(state.files).some((key) => key.startsWith(`${projectKey}::`))
      if (!hasFiles && !state.statuses[projectKey]) {
        return state
      }
      const nextFiles: Record<string, DocumentEntry> = {}
      for (const [key, value] of Object.entries(state.files)) {
        if (!key.startsWith(`${projectKey}::`)) {
          nextFiles[key] = value
        }
      }
      const nextStatuses = { ...state.statuses }
      delete nextStatuses[projectKey]
      return {
        ...state,
        files: nextFiles,
        statuses: nextStatuses
      }
    })
}))

export function useDocsWatcher(projectId?: string): void {
  const handleEvent = useDocsStore((state) => state.handleEvent)
  const clearProject = useDocsStore((state) => state.clearProject)

  useEffect(() => {
    if (!projectId) {
      return undefined
    }
    type DocsSubscribe = (
      opts: { projectId?: string },
      handler: (event: DocsWatcherEvent) => void
    ) => () => void
    const docsApi = (
      window as unknown as {
        api?: { docs?: { subscribe?: DocsSubscribe } }
      }
    ).api?.docs
    if (!docsApi?.subscribe) {
      return undefined
    }
    const unsubscribe = docsApi.subscribe({ projectId }, (event) => {
      handleEvent(event)
    })
    return () => {
      unsubscribe?.()
      clearProject(projectId)
    }
  }, [projectId, handleEvent, clearProject])
}

export function useDocContent(projectId: string | undefined, path: string | undefined) {
  const selector = useMemo(() => {
    const key = toDocKey(projectId, path ?? null)
    return (state: DocsWatcherState) => (key ? state.files[key] : undefined)
  }, [projectId, path])
  return useDocsStore(selector)
}

// 当 docs 目录发生变更（新增/修改/删除/ready）时，自动触发 fs.tree 的失效，从而刷新文件列表。
// 默认与 SpecExplorer 的深度保持一致（8）。
export function useDocsTreeAutoRefetch(projectId?: string, depth: number = 8): void {
  const qc = useQueryClient()

  useEffect(() => {
    if (!projectId) return undefined

    type DocsSubscribe = (
      opts: { projectId?: string },
      handler: (event: DocsWatcherEvent) => void
    ) => () => void
    const docsApi = (
      window as unknown as {
        api?: { docs?: { subscribe?: DocsSubscribe } }
      }
    ).api?.docs
    if (!docsApi?.subscribe) return undefined

    const input = { base: 'docs' as const, depth, projectId }
    const treeQuery = orpc.fs.tree.queryOptions({ input })

    let scheduled = false
    const flush = () => {
      scheduled = false
      // 仅按具体的 queryKey 失效，避免误伤其他查询
      void qc.invalidateQueries({ queryKey: treeQuery.queryKey })
    }

    const unsubscribe = docsApi.subscribe({ projectId }, (event) => {
      if (event.kind === 'file' || event.kind === 'ready') {
        if (!scheduled) {
          scheduled = true
          queueMicrotask(flush)
        }
      }
    })
    return () => {
      unsubscribe?.()
    }
  }, [projectId, depth, qc])
}
