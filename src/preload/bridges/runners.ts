import type { ContractRouterClient } from '@orpc/contract'
import type { RantcodeContract } from '../../shared/orpc/contract'
import type { RunnerRunOptions } from '../../shared/types/webui'
import type { Runner } from '../../shared/runners'
import type { SubscribeNotifyFn, NotifyPayloadMap } from '../../shared/notify'

export type RunnersBridge = {
  run(opts: RunnerRunOptions): Promise<{ traceId: string }>
  subscribe(handler: (event: NotifyPayloadMap['codex']) => void): () => void
  cancel(traceId: string): Promise<{ ok: boolean }>
}

export function createRunnersBridge(
  client: ContractRouterClient<RantcodeContract>,
  subscribeNotify: SubscribeNotifyFn
): RunnersBridge {
  return {
    run(opts) {
      const runner: Runner = opts.runner || 'codex'
      const input: RunnerRunOptions = { ...opts, runner }
      return client.runners.run(input)
    },
    cancel(traceId) {
      return client.runners.cancel({ traceId })
    },
    subscribe(handler) {
      return subscribeNotify('codex', handler)
    }
  }
}
