import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useAutoScrollBottom } from '@/shared/hooks/useAutoScroll'
import type { Message as BaseMessage } from '@/features/workspace/types'

/**
 * 消息列表组件
 * - 支持自动滚动到底部
 * - 用户发送消息时强制滚动
 * - 使用 memo 优化避免不必要的重渲染
 */
export const MessageList = memo(function MessageList<T extends BaseMessage>({
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

  // 简化的依赖信号：只关注消息数量、最后消息ID和状态
  // 这足以检测新消息和状态变化，减少不必要的字符串拼接
  const depSignal = useMemo(() => {
    const len = messages.length
    if (len === 0) return 0
    const last = messages[len - 1]
    // 使用简单的数字来表示变化，避免复杂的字符串拼接
    const statusCode = last.status === 'running' ? 1 : last.status === 'success' ? 2 : 0
    // 结合消息数量和状态，产生一个变化信号
    return len * 10 + statusCode
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
}) as <T extends BaseMessage>(props: {
  messages: T[]
  renderMessage: (m: T) => React.ReactNode
}) => React.ReactNode
