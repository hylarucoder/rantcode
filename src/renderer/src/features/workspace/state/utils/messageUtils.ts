import type { Message, Session } from '@/features/workspace/types'
import type { RunnerEvent } from '@shared/types/webui'

/** 构建 traceId -> message 索引 */
export function buildTraceIndex(
  session: Session,
  sessionId: string,
  index: Record<string, { sessionId: string; messageIndex: number }>
): void {
  session.messages.forEach((msg, msgIndex) => {
    if (msg.traceId) {
      index[msg.traceId] = { sessionId, messageIndex: msgIndex }
    }
  })
}

/**
 * 通过 traceId 查找并更新消息的统一函数
 * @param sessions 所有会话
 * @param traceId 要查找的 traceId
 * @param updateFn 更新回调，返回更新结果
 * @param options 可选项，包含 workspace 引用以更新索引
 * @returns 是否找到并更新了消息
 */
export function updateMessageByTraceId(
  sessions: Session[],
  traceId: string,
  updateFn: (
    session: Session,
    message: Message,
    messageIndex: number
  ) => { shouldUpdateIndex: boolean; isContextEvent?: boolean; contextId?: string },
  options?: {
    workspace?: { traceIndex: Record<string, { sessionId: string; messageIndex: number }> }
  }
): boolean {
  for (const session of sessions) {
    const messageIndex = session.messages.findIndex((msg) => msg.traceId === traceId)
    if (messageIndex !== -1) {
      const message = session.messages[messageIndex]
      const result = updateFn(session, message, messageIndex)

      // 如果是上下文标识事件，更新会话级别的 runnerContexts
      if (result.isContextEvent && result.contextId && message.runner) {
        if (!session.runnerContexts) {
          session.runnerContexts = {}
        }
        session.runnerContexts[message.runner] = result.contextId
      }

      // 更新索引
      if (result.shouldUpdateIndex && options?.workspace?.traceIndex) {
        options.workspace.traceIndex[traceId] = {
          sessionId: session.id,
          messageIndex
        }
      }
      return true
    }
  }
  return false
}

/** 应用 RunnerEvent 到消息 */
export function applyEventToMessage(msg: Message, event: RunnerEvent): Message {
  if (!msg.traceId || msg.traceId !== event.traceId) return msg
  switch (event.type) {
    case 'context':
      // 收到上下文标识事件，同时存储到消息中便于显示
      return { ...msg, contextId: event.contextId }
    case 'log': {
      const entry = {
        id: `${event.traceId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        stream: event.stream,
        text: event.data,
        timestamp: Date.now()
      } as const
      const nextLogs = [...(msg.logs ?? []), entry]
      // 不再用 log 事件更新 output，改用 text 事件
      return { ...msg, logs: nextLogs }
    }
    case 'text': {
      // 流式文本内容事件
      const nextOutput = event.delta ? `${msg.output ?? ''}${event.text}` : event.text
      return { ...msg, output: nextOutput }
    }
    case 'claude_message': {
      // 可选：保存原始消息用于调试或其他用途
      // 这里主要处理 assistant 消息的内容
      if (event.messageType === 'assistant' && event.content) {
        return { ...msg, output: event.content }
      }
      return msg
    }
    case 'error':
      return { ...msg, status: 'error', errorMessage: event.message }
    case 'exit':
      return { ...msg, status: event.code === 0 ? 'success' : 'error' }
    default:
      return msg
  }
}
