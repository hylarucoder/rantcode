import { useEffect, useMemo, useRef, useState } from 'react'
import { useAutoScrollBottom } from '@/shared/hooks/useAutoScroll'
import type { ChatMessage as BaseMessage } from '@/features/workspace/types'

export function MessageList<T extends BaseMessage>({
  messages,
  renderMessage
}: {
  messages: T[]
  renderMessage: (m: T) => React.ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  // 当用户滚动离底部时，暂停自动跟随；默认自动跟随
  const [stickToBottom, setStickToBottom] = useState(true)
  const prevLenRef = useRef(0)
  const depSignal = useMemo(() => {
    const len = messages.length
    if (len === 0) return '0'
    const last = messages[len - 1] as unknown as {
      id?: string
      content?: string
      logs?: unknown[]
      output?: string
      status?: string
    }
    const id = last?.id ?? ''
    const c = last?.content?.length ?? 0
    const l = Array.isArray(last?.logs) ? last!.logs!.length : 0
    const o = last?.output?.length ?? 0
    const s = last?.status ?? ''
    return `${len}|${id}|${c}|${l}|${o}|${s}`
  }, [messages])
  useAutoScrollBottom(ref, stickToBottom, [depSignal])

  // 聊天发送后，无论当前是否在底部，都强制滚动到底部
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const len = messages.length
    const prevLen = prevLenRef.current
    if (len <= prevLen) {
      prevLenRef.current = len
      return
    }
    const added = messages.slice(prevLen) as Array<BaseMessage & { role?: string | undefined }>
    prevLenRef.current = len
    const hasNewUserMessage = added.some((m) => m.role === 'user')
    if (!hasNewUserMessage) return
    setStickToBottom(true)
    el.scrollTop = el.scrollHeight
  }, [messages])
  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 overflow-y-auto py-1"
      onScroll={(e) => {
        const el = e.currentTarget
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 48
        setStickToBottom(atBottom)
      }}
    >
      {messages.length === 0 && (
        <span className="text-xs text-muted-foreground">No messages yet.</span>
      )}
      {messages.map((m) => (
        <div key={m.id} className="mb-1.5 last:mb-0">
          {renderMessage(m)}
        </div>
      ))}
    </div>
  )
}
