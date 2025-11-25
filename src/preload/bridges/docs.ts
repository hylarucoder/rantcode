import type { ContractRouterClient } from '@orpc/contract'
import type { RantcodeContract } from '../../shared/orpc/contract'
import type { DocsWatcherEvent } from '../../shared/types/webui'

export type DocsBridge = {
  subscribe(
    opts: { workspaceId?: string } | undefined,
    handler: (event: DocsWatcherEvent) => void
  ): () => void
}

export function createDocsBridge(
  client: ContractRouterClient<RantcodeContract>,
  subscribeNotify: <T>(topic: string, handler: (payload: T) => void) => () => void
): DocsBridge {
  return {
    subscribe(opts, handler) {
      const normalizedWorkspace = opts?.workspaceId?.trim()
      const workspaceId =
        normalizedWorkspace && normalizedWorkspace.length > 0 ? normalizedWorkspace : undefined

      const unNotify = subscribeNotify<DocsWatcherEvent>('docs', (payload) => {
        if (typeof workspaceId === 'string' && (payload.workspaceId ?? undefined) !== workspaceId)
          return
        handler(payload)
      })

      client.docs
        .subscribe({ workspaceId })
        .then((result) => {
          if (!result?.ok) {
            const message = result?.error ?? 'Unknown error'
            handler({ workspaceId, kind: 'error', message })

            console.error('Failed to subscribe to docs watcher', message)
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Unknown docs watcher error'
          handler({ workspaceId, kind: 'error', message })

          console.error('Failed to subscribe to docs watcher', error)
        })

      return () => {
        unNotify()
        client.docs.unsubscribe({ workspaceId }).catch(() => void 0)
      }
    }
  }
}
