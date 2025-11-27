import type { ContractRouterClient } from '@orpc/contract'
import type { RantcodeContract } from '../../shared/orpc/contract'
import type { CodexEvent, CodexRunOptions } from '../../shared/types/webui'

export type AgentsBridge = {
  run(opts: CodexRunOptions): Promise<{ jobId: string }>
  subscribe(handler: (event: CodexEvent) => void): () => void
  cancel(jobId: string): Promise<{ ok: boolean }>
}

export function createAgentsBridge(
  client: ContractRouterClient<RantcodeContract>,
  subscribeNotify: <T>(topic: string, handler: (payload: T) => void) => () => void
): AgentsBridge {
  return {
    run(opts) {
      const input: CodexRunOptions = { ...opts, agent: opts.agent || 'codex' }
      return client.codex.run(input)
    },
    cancel(jobId) {
      return client.codex.cancel({ jobId })
    },
    subscribe(handler) {
      return subscribeNotify<CodexEvent>('codex', handler)
    }
  }
}
