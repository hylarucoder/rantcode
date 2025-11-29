import { useEffect } from 'react'
import { create } from 'zustand'
import type { RunnerEvent } from '@shared/types/webui'

export interface RunnerLogEntry {
  id: string
  jobId: string
  stream: 'stdout' | 'stderr'
  text: string
  timestamp: number
}

interface RunnerLogState {
  entries: RunnerLogEntry[]
  appendFromEvent: (event: RunnerEvent) => void
  clear: () => void
}

export const useRunnerLogStore = create<RunnerLogState>((set) => ({
  entries: [],
  appendFromEvent: (event) =>
    set((state) => {
      if (event.type !== 'log') return state
      const entry: RunnerLogEntry = {
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

export function useRunnerLogSubscription(): void {
  const appendFromEvent = useRunnerLogStore((state) => state.appendFromEvent)

  useEffect(() => {
    const w = window as unknown as {
      agents?: { subscribe?: (h: (e: RunnerEvent) => void) => () => void }
    }
    const runnerBridge = w.agents
    if (!runnerBridge?.subscribe) return undefined
    const unsubscribe = runnerBridge.subscribe((event: RunnerEvent) => {
      appendFromEvent(event)
    })
    return () => {
      unsubscribe()
    }
  }, [appendFromEvent])
}

