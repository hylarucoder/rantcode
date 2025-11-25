import type { ContractRouterClient } from '@orpc/contract'
import type { RantcodeContract } from '../../shared/orpc/contract'
import type { CodexEvent, CodexRunOptions } from '../../shared/types/webui'

export type AgentVendor = 'codex' | 'claude-code' | 'kimi-cli'

export type AgentsBridge = {
  run(opts: Omit<CodexRunOptions, 'engine'> & { vendor?: AgentVendor }): Promise<{ jobId: string }>
  subscribe(handler: (event: CodexEvent) => void): () => void
  cancel(jobId: string): Promise<{ ok: boolean }>
  vendor: Record<
    AgentVendor,
    { run: (opts: Omit<CodexRunOptions, 'engine'>) => Promise<{ jobId: string }> }
  >
}

export function createAgentsBridge(
  client: ContractRouterClient<RantcodeContract>,
  subscribeNotify: <T>(topic: string, handler: (payload: T) => void) => () => void
): AgentsBridge {
  return {
    run(opts) {
      const engine = (opts.vendor || 'codex') as AgentVendor
      const input = { ...(opts as Omit<CodexRunOptions, 'engine'>), engine } as CodexRunOptions
      return client.codex.run(input)
    },
    vendor: {
      codex: {
        run: (opts) => client.codex.run({ ...(opts as CodexRunOptions), engine: 'codex' })
      },
      'claude-code': {
        run: (opts) => client.codex.run({ ...(opts as CodexRunOptions), engine: 'claude-code' })
      },
      'kimi-cli': {
        run: (opts) => client.codex.run({ ...(opts as CodexRunOptions), engine: 'kimi-cli' })
      }
    },
    cancel(jobId) {
      return client.codex.cancel({ jobId })
    },
    subscribe(handler) {
      return subscribeNotify<CodexEvent>('codex', handler)
    }
  }
}
