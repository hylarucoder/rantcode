import { createORPCClient } from '@orpc/client'
import { createRouterUtils } from '@orpc/tanstack-query'
import type { ContractRouterClient } from '@orpc/contract'
import type { RantcodeContract } from '@shared/orpc/contract'

const link = {
  call(path: readonly string[], input: unknown): Promise<unknown> {
    const call = (
      window as unknown as {
        api?: { orpcCall?: (path: readonly string[], input: unknown) => Promise<unknown> }
      }
    ).api?.orpcCall
    if (typeof call !== 'function') {
      console.error('[oRPC] window.api.orpcCall is unavailable')
      throw new Error('window.api.orpcCall is unavailable. Ensure preload exposed it.')
    }
    return call(path, input)
  }
}

type ClientType = ContractRouterClient<RantcodeContract>
const client = createORPCClient(link) as ClientType
export const orpc = createRouterUtils<ClientType>(client)
