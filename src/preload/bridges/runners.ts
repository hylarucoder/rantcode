import type { ContractRouterClient } from '@orpc/contract'
import type { RantcodeContract } from '../../shared/orpc/contract'
import type { RunnerEvent, RunnerRunOptions } from '../../shared/types/webui'
import type { Runner } from '../../shared/runners'

export type RunnersBridge = {
  run(opts: RunnerRunOptions): Promise<{ jobId: string }>
  subscribe(handler: (event: RunnerEvent) => void): () => void
  cancel(jobId: string): Promise<{ ok: boolean }>
}

export function createRunnersBridge(
  client: ContractRouterClient<RantcodeContract>,
  subscribeNotify: <T>(topic: string, handler: (payload: T) => void) => () => void
): RunnersBridge {
  return {
    run(opts) {
      const runner: Runner = opts.runner || 'codex'
      const input: RunnerRunOptions = { ...opts, runner }
      return client.runners.run(input)
    },
    cancel(jobId) {
      return client.runners.cancel({ jobId })
    },
    subscribe(handler) {
      return subscribeNotify<RunnerEvent>('codex', handler)
    }
  }
}
