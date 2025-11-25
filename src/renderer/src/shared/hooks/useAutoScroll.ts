import { useEffect } from 'react'

/**
 * Scroll a container to bottom when deps change.
 * Pass `enabled=false` to disable (e.g., when用户滚动离底部时不跟随)。
 */
export function useAutoScrollBottom(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  deps: React.DependencyList
): void {
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, deps)
}

/**
 * Utility to compute stick-to-bottom based on current scroll position.
 * Returns a handler to attach on scroll to update a boolean state setter.
 */
export function createStickToBottomHandler(
  setStick: (v: boolean) => void,
  threshold = 48
): (el: HTMLElement) => void {
  return (el: HTMLElement) => {
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
    setStick(atBottom)
  }
}
