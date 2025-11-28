import type { ContractRouterClient } from '@orpc/contract'
import type { RantcodeContract } from '../../shared/orpc/contract'
import type { AgentEvent, AgentRunOptions } from '../../shared/types/webui'

export type AgentsBridge = {
  run(opts: AgentRunOptions): Promise<{ jobId: string }>
  subscribe(handler: (event: AgentEvent) => void): () => void
  cancel(jobId: string): Promise<{ ok: boolean }>
}

export function createAgentsBridge(
  client: ContractRouterClient<RantcodeContract>,
  subscribeNotify: <T>(topic: string, handler: (payload: T) => void) => () => void
): AgentsBridge {
  return {
    run(opts) {
      const input: AgentRunOptions = { ...opts, agent: opts.agent || 'codex' }
      return client.agents.run(input)
    },
    cancel(jobId) {
      return client.agents.cancel({ jobId })
    },
    subscribe(handler) {
      return subscribeNotify<AgentEvent>('codex', handler)
    }
  }
}
