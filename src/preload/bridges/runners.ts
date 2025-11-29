import type { ContractRouterClient } from '@orpc/contract'
import type { RantcodeContract } from '../../shared/orpc/contract'
import type { AgentEvent, AgentRunOptions } from '../../shared/types/webui'
import type { Runner } from '../../shared/runners'

export type RunnersBridge = {
  run(opts: AgentRunOptions): Promise<{ jobId: string }>
  subscribe(handler: (event: AgentEvent) => void): () => void
  cancel(jobId: string): Promise<{ ok: boolean }>
}

export function createRunnersBridge(
  client: ContractRouterClient<RantcodeContract>,
  subscribeNotify: <T>(topic: string, handler: (payload: T) => void) => () => void
): RunnersBridge {
  return {
    run(opts) {
      // 兼容：优先使用 runner，回退到 agent（已废弃）
      const runner: Runner = (opts.runner ||
        (opts as { agent?: Runner }).agent ||
        'codex') as Runner
      const input: AgentRunOptions = { ...opts, runner }
      return client.runners.run(input)
    },
    cancel(jobId) {
      return client.runners.cancel({ jobId })
    },
    subscribe(handler) {
      return subscribeNotify<AgentEvent>('codex', handler)
    }
  }
}

// ============================================================================
// 兼容性导出（过渡期使用，后续删除）
// ============================================================================

/** @deprecated 使用 RunnersBridge 代替 */
export type AgentsBridge = RunnersBridge

/** @deprecated 使用 createRunnersBridge 代替 */
export const createAgentsBridge = createRunnersBridge
