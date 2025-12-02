import { useSyncExternalStore } from 'react'

/**
 * 共享的当前时间 store
 * 所有订阅者共享同一个定时器，避免每个组件都创建独立的定时器
 */
let now = Date.now()
const listeners = new Set<() => void>()
let intervalId: number | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)

  // 首次订阅时启动定时器
  if (listeners.size === 1 && intervalId === null) {
    intervalId = window.setInterval(() => {
      now = Date.now()
      listeners.forEach((l) => l())
    }, 60_000) // 每分钟更新一次
  }

  return () => {
    listeners.delete(listener)

    // 最后一个订阅者取消时，清理定时器
    if (listeners.size === 0 && intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
  }
}

function getSnapshot() {
  return now
}

/**
 * 共享的当前时间 hook
 *
 * 所有使用这个 hook 的组件共享同一个定时器
 * 每分钟更新一次，适用于相对时间显示
 */
export function useSharedNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
