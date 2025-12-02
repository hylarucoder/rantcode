import type { MessagePortMain } from 'electron'
import { loggerService } from './services/loggerService'
import type { NotifyTopic, NotifyPayloadMap, NotifyMessage } from '../shared/notify'

// Extend MessagePortMain to include optional start() method
type MessagePortMainWithStart = MessagePortMain & {
  start?(): void
}

const ports = new Map<number, MessagePortMain>()
const log = loggerService.child('notify')

export function registerNotifyPort(contentsId: number, port: MessagePortMain): void {
  ;(port as MessagePortMainWithStart).start?.()
  ports.set(contentsId, port)
  log.info('notify-port-registered', { contentsId })
}

export function unregisterNotifyPort(contentsId: number): void {
  const port = ports.get(contentsId)
  port?.close?.()
  ports.delete(contentsId)
  log.info('notify-port-unregistered', { contentsId })
}

/**
 * 类型安全的 Notify 推送
 */
function postNotify<T extends NotifyTopic>(
  topic: T,
  contentsId: number,
  payload: NotifyPayloadMap[T]
): void {
  const port = ports.get(contentsId)
  if (!port) {
    log.debug('notify-skipped-no-port', { topic, contentsId })
    return
  }
  try {
    const message: NotifyMessage<T> = { topic, payload }
    port.postMessage(message)
  } catch (err) {
    const asErr = err as { message?: string; stack?: string }
    log.error('notify-send-failed', {
      topic,
      contentsId,
      errorMessage: asErr?.message,
      stack: asErr?.stack
    })
  }
}

export function notifyDocs(contentsId: number, payload: NotifyPayloadMap['docs']): void {
  postNotify('docs', contentsId, payload)
}

export function notifyCodex(contentsId: number, payload: NotifyPayloadMap['codex']): void {
  postNotify('codex', contentsId, payload)
}

export function notifyRunnerEvent(
  contentsId: number,
  payload: NotifyPayloadMap['runner.event']
): void {
  postNotify('runner.event', contentsId, payload)
}
