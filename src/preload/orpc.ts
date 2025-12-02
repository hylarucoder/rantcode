import { ipcRenderer } from 'electron'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import type { ContractRouterClient } from '@orpc/contract'
import type { RantcodeContract } from '../shared/orpc/contract'
import type {
  NotifyTopic,
  NotifyPayloadMap,
  SubscribeNotifyFn,
  NotifyMessage
} from '../shared/notify'

// Extend MessagePort to include optional start() method
type MessagePortWithStart = MessagePort & {
  start?(): void
}

export type OrpcEnv = {
  client: ContractRouterClient<RantcodeContract>
  notifyPort: MessagePort
  subscribeNotify: SubscribeNotifyFn
}

export function setupOrpc(): OrpcEnv {
  // oRPC RPC channel
  const orpcChannel = new MessageChannel()
  ipcRenderer.postMessage('orpc:connect', null, [orpcChannel.port2])
  ;(orpcChannel.port1 as MessagePortWithStart).start?.()

  const client: ContractRouterClient<RantcodeContract> = createORPCClient(
    new RPCLink({ port: orpcChannel.port1 })
  )

  // Notify channel (server -> renderer)
  const notifyChannel = new MessageChannel()
  ipcRenderer.postMessage('orpc:notify-connect', null, [notifyChannel.port2])
  ;(notifyChannel.port1 as MessagePortWithStart).start?.()

  function subscribeNotify<T extends NotifyTopic>(
    topic: T,
    handler: (payload: NotifyPayloadMap[T]) => void
  ): () => void {
    const listener = (event: MessageEvent) => {
      const data = event.data as NotifyMessage | undefined
      if (!data || data.topic !== topic) return
      handler(data.payload as NotifyPayloadMap[T])
    }
    notifyChannel.port1.addEventListener('message', listener as EventListener)
    return () => notifyChannel.port1.removeEventListener('message', listener as EventListener)
  }

  return { client, notifyPort: notifyChannel.port1, subscribeNotify }
}
