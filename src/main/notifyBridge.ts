import type { MessagePortMain } from 'electron'

// Extend MessagePortMain to include optional start() method
type MessagePortMainWithStart = MessagePortMain & {
  start?(): void
}

const ports = new Map<number, MessagePortMain>()

export function registerNotifyPort(contentsId: number, port: MessagePortMain): void {
  ;(port as MessagePortMainWithStart).start?.()
  ports.set(contentsId, port)
}

export function unregisterNotifyPort(contentsId: number): void {
  const port = ports.get(contentsId)
  port?.close?.()
  ports.delete(contentsId)
}

export function notifyDocs(contentsId: number, payload: unknown): void {
  const port = ports.get(contentsId)
  if (!port) return
  try {
    port.postMessage({ topic: 'docs', payload })
  } catch {}
}

export function notifyCodex(contentsId: number, payload: unknown): void {
  const port = ports.get(contentsId)
  if (!port) return
  try {
    port.postMessage({ topic: 'codex', payload })
  } catch {}
}
