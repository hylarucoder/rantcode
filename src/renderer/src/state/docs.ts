import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/lib/orpcQuery'
import { create } from 'zustand'
import type { DocsWatcherEvent } from '@shared/types/webui'

const DEFAULT_WORKSPACE_KEY = '__default__'

function normalizeWorkspaceId(workspaceId?: string): string | undefined {
  const trimmed = workspaceId?.trim()
  if (!trimmed || trimmed.length === 0) {
    return undefined
  }
  return trimmed
}

function toWorkspaceKey(workspaceId?: string): string {
  return normalizeWorkspaceId(workspaceId) ?? DEFAULT_WORKSPACE_KEY
}

function toDocKey(workspaceId: string | undefined, path?: string | null): string | null {
  if (!path) return null
  return `${toWorkspaceKey(workspaceId)}::${path}`
}

interface DocumentEntry {
  workspaceId?: string
  path: string
  content?: string
  updatedAt?: number
}

interface WorkspaceStatus {
  ready: boolean
  error?: string
}

interface DocsWatcherState {
  files: Record<string, DocumentEntry>
  statuses: Record<string, WorkspaceStatus>
  handleEvent: (event: DocsWatcherEvent) => void
  setInitialContent: (workspaceId: string | undefined, path: string, content?: string) => void
  clearWorkspace: (workspaceId: string | undefined) => void
}

export const useDocsStore = create<DocsWatcherState>((set) => ({
  files: {},
  statuses: {},
  handleEvent: (event) =>
    set((state) => {
      const workspaceKey = toWorkspaceKey(event.workspaceId)
      if (event.kind === 'ready') {
        return {
          ...state,
          statuses: {
            ...state.statuses,
            [workspaceKey]: { ready: true }
          }
        }
      }

      if (event.kind === 'error') {
        return {
          ...state,
          statuses: {
            ...state.statuses,
            [workspaceKey]: { ready: false, error: event.message }
          }
        }
      }

      const docKey = toDocKey(event.workspaceId, event.path)
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
            workspaceId: event.workspaceId,
            path: event.path,
            content: nextContent,
            updatedAt: nextUpdatedAt
          }
        },
        statuses: {
          ...state.statuses,
          [workspaceKey]: { ready: true }
        }
      }
    }),
  setInitialContent: (workspaceId, path, content) =>
    set((state) => {
      if (typeof content !== 'string') {
        return state
      }
      const docKey = toDocKey(workspaceId, path)
      if (!docKey) {
        return state
      }
      return {
        ...state,
        files: {
          ...state.files,
          [docKey]: {
            workspaceId,
            path,
            content,
            updatedAt: Date.now()
          }
        },
        statuses: {
          ...state.statuses,
          [toWorkspaceKey(workspaceId)]: { ready: true }
        }
      }
    }),
  clearWorkspace: (workspaceId) =>
    set((state) => {
      const workspaceKey = toWorkspaceKey(workspaceId)
      const hasFiles = Object.keys(state.files).some((key) => key.startsWith(`${workspaceKey}::`))
      if (!hasFiles && !state.statuses[workspaceKey]) {
        return state
      }
      const nextFiles: Record<string, DocumentEntry> = {}
      for (const [key, value] of Object.entries(state.files)) {
        if (!key.startsWith(`${workspaceKey}::`)) {
          nextFiles[key] = value
        }
      }
      const nextStatuses = { ...state.statuses }
      delete nextStatuses[workspaceKey]
      return {
        ...state,
        files: nextFiles,
        statuses: nextStatuses
      }
    })
}))

export function useDocsWatcher(workspaceId?: string): void {
  const handleEvent = useDocsStore((state) => state.handleEvent)
  const clearWorkspace = useDocsStore((state) => state.clearWorkspace)

  useEffect(() => {
    if (!workspaceId) {
      return undefined
    }
    type DocsSubscribe = (
      opts: { workspaceId?: string },
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
    const unsubscribe = docsApi.subscribe({ workspaceId }, (event) => {
      handleEvent(event)
    })
    return () => {
      unsubscribe?.()
      clearWorkspace(workspaceId)
    }
  }, [workspaceId, handleEvent, clearWorkspace])
}

export function useDocContent(workspaceId: string | undefined, path: string | undefined) {
  const selector = useMemo(() => {
    const key = toDocKey(workspaceId, path ?? null)
    return (state: DocsWatcherState) => (key ? state.files[key] : undefined)
  }, [workspaceId, path])
  return useDocsStore(selector)
}

// 当 docs 目录发生变更（新增/修改/删除/ready）时，自动触发 fs.tree 的失效，从而刷新文件列表。
// 默认与 SpecExplorer 的深度保持一致（8）。
export function useDocsTreeAutoRefetch(workspaceId?: string, depth: number = 8): void {
  const qc = useQueryClient()

  useEffect(() => {
    if (!workspaceId) return undefined

    type DocsSubscribe = (
      opts: { workspaceId?: string },
      handler: (event: DocsWatcherEvent) => void
    ) => () => void
    const docsApi = (
      window as unknown as {
        api?: { docs?: { subscribe?: DocsSubscribe } }
      }
    ).api?.docs
    if (!docsApi?.subscribe) return undefined

    const input = { base: 'docs' as const, depth, workspaceId }
    const treeQuery = orpc.fs.tree.queryOptions({ input })

    let scheduled = false
    const flush = () => {
      scheduled = false
      // 仅按具体的 queryKey 失效，避免误伤其他查询
      void qc.invalidateQueries({ queryKey: treeQuery.queryKey })
    }

    const unsubscribe = docsApi.subscribe({ workspaceId }, (event) => {
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
  }, [workspaceId, depth, qc])
}
