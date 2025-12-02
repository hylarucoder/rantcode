/**
 * Notify 通道类型定义
 *
 * 定义主进程 -> renderer 的推送消息类型约束，
 * 避免"魔法字符串"和 payload 结构漂移。
 */

import type { DocsWatcherEvent, RunnerEvent } from './types/webui'

/**
 * 所有支持的 Notify topic
 */
export type NotifyTopic = 'docs' | 'codex' | 'runner.event'

/**
 * Topic -> Payload 类型映射
 */
export interface NotifyPayloadMap {
  docs: DocsWatcherEvent
  codex: RunnerEvent
  'runner.event': RunnerEvent
}

/**
 * 类型安全的 subscribeNotify 签名
 */
export type SubscribeNotifyFn = <T extends NotifyTopic>(
  topic: T,
  handler: (payload: NotifyPayloadMap[T]) => void
) => () => void

/**
 * Notify 消息结构（通过 MessagePort 传输）
 */
export interface NotifyMessage<T extends NotifyTopic = NotifyTopic> {
  topic: T
  payload: NotifyPayloadMap[T]
}
