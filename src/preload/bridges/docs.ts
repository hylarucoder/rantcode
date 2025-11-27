import type { ContractRouterClient } from '@orpc/contract'
import type { RantcodeContract } from '../../shared/orpc/contract'
import type { DocsWatcherEvent } from '../../shared/types/webui'

export type DocsBridge = {
  subscribe(
    opts: { projectId?: string } | undefined,
    handler: (event: DocsWatcherEvent) => void
  ): () => void
}

export function createDocsBridge(
  client: ContractRouterClient<RantcodeContract>,
  subscribeNotify: <T>(topic: string, handler: (payload: T) => void) => () => void
): DocsBridge {
  return {
    subscribe(opts, handler) {
      const normalizedWorkspace = opts?.projectId?.trim()
      const projectId =
        normalizedWorkspace && normalizedWorkspace.length > 0 ? normalizedWorkspace : undefined

      const unNotify = subscribeNotify<DocsWatcherEvent>('docs', (payload) => {
        if (typeof projectId === 'string' && (payload.projectId ?? undefined) !== projectId) return
        handler(payload)
      })

      client.docs
        .subscribe({ projectId })
        .then((result) => {
          if (!result?.ok) {
            const message = result?.error ?? 'Unknown error'
            handler({ projectId, kind: 'error', message })

            console.error('Failed to subscribe to docs watcher', message)
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Unknown docs watcher error'
          handler({ projectId, kind: 'error', message })

          console.error('Failed to subscribe to docs watcher', error)
        })

      return () => {
        unNotify()
        client.docs.unsubscribe({ projectId }).catch(() => void 0)
      }
    }
  }
}
