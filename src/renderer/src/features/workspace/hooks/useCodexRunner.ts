import { useCallback } from 'react'
import type { AgentEvent, AgentRunOptions } from '@shared/types/webui'

/**
 * Thin wrapper over window.api.agents to normalize run/subscribe usage.
 * Keeps renderer code decoupled from the global bridge details.
 */
export function useCodexRunner() {
  const run = useCallback(async (opts: AgentRunOptions) => {
    const win = window as unknown as {
      api?: { agents?: { run?: (o: AgentRunOptions) => Promise<{ jobId: string }> } }
    }
    const bridge = win.api?.agents
    if (!bridge?.run) throw new Error('Agent bridge unavailable')
    return bridge.run(opts)
  }, [])

  const subscribe = useCallback((handler: (event: AgentEvent) => void) => {
    const win = window as unknown as {
      api?: { agents?: { subscribe?: (h: (e: AgentEvent) => void) => () => void } }
    }
    const bridge = win.api?.agents
    if (!bridge?.subscribe) return () => {}
    return bridge.subscribe(handler)
  }, [])

  const cancel = useCallback(async (jobId: string) => {
    const win = window as unknown as {
      api?: { agents?: { cancel?: (id: string) => Promise<{ ok: boolean }> } }
    }
    const bridge = win.api?.agents
    if (!bridge?.cancel) return { ok: false }
    return bridge.cancel(jobId)
  }, [])

  return { run, subscribe, cancel }
}
