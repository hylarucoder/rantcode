import { useEffect } from 'react'
import { create } from 'zustand'
import type { CodexEvent } from '@shared/types/webui'

export interface ExecLogEntry {
  id: string
  jobId: string
  stream: 'stdout' | 'stderr'
  text: string
  timestamp: number
}

interface CodexLogState {
  entries: ExecLogEntry[]
  appendFromEvent: (event: CodexEvent) => void
  clear: () => void
}

export const useCodexLogStore = create<CodexLogState>((set) => ({
  entries: [],
  appendFromEvent: (event) =>
    set((state) => {
      if (event.type !== 'log') return state
      const entry: ExecLogEntry = {
        id: `${event.jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        jobId: event.jobId,
        stream: event.stream,
        text: event.data,
        timestamp: Date.now()
      }
      // Cap in-memory logs to avoid unbounded growth during long sessions
      const MAX_ENTRIES = 5000
      const next = [...state.entries, entry]
      const sliced = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
      return { ...state, entries: sliced }
    }),
  clear: () => set({ entries: [] })
}))

export function useCodexLogSubscription(): void {
  const appendFromEvent = useCodexLogStore((state) => state.appendFromEvent)

  useEffect(() => {
    const w = window as unknown as {
      agents?: { subscribe?: (h: (e: CodexEvent) => void) => () => void }
    }
    const codexBridge = w.agents
    if (!codexBridge?.subscribe) return undefined
    const unsubscribe = codexBridge.subscribe((event: CodexEvent) => {
      appendFromEvent(event)
    })
    return () => {
      unsubscribe()
    }
  }, [appendFromEvent])
}
