import { create } from 'zustand'
import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { Message, Session, RunnerContextMap } from '@/features/workspace/types'
import type { RunnerEvent } from '@shared/types/webui'
import { orpc } from '@/lib/orpcQuery'
import { getLogger } from '@/lib/logger'
import { buildTraceIndex, updateMessageByTraceId, applyEventToMessage } from './utils/messageUtils'

// 稳定的空列表，避免 selector 在工作区未初始化时返回新引用导致不必要的重渲染
export const EMPTY_SESSIONS: Session[] = []

// oRPC sessions namespace type
type SessionsNamespace = {
  list: {
    call: (input: { projectId: string; includeArchived?: boolean }) => Promise<Session[]>
  }
  create: { call: (input: { projectId: string; title?: string }) => Promise<Session> }
  update: {
    call: (input: {
      projectId: string
      sessionId: string
      title?: string
      runnerContexts?: RunnerContextMap
      archived?: boolean
    }) => Promise<Session>
  }
  delete: { call: (input: { projectId: string; sessionId: string }) => Promise<{ ok: boolean }> }
  appendMessages: {
    call: (input: { projectId: string; sessionId: string; messages: Message[] }) => Promise<Session>
  }
  updateMessage: {
    call: (input: {
      projectId: string
      sessionId: string
      messageId: string
      patch: Partial<Message>
    }) => Promise<Session>
  }
}

// 消息同步队列，用于防抖和去重
const messageSyncQueue = new Map<string, NodeJS.Timeout>()

// workspace 相关日志（统一模块名）
const log = getLogger('workspace.sessions')

export function getSessionsApi(): SessionsNamespace | null {
  const sessions = (orpc as { sessions?: SessionsNamespace }).sessions
  return sessions ?? null
}

export type ChatProjectState = {
  sessions: Session[]
  activeSessionId: string | null
  // 添加索引：traceId -> { sessionId, messageIndex }
  // 使用对象而不是 Map，因为 Map 不能被序列化
  traceIndex: Record<string, { sessionId: string; messageIndex: number }>
  // 细粒度更新计数器：当消息内容流式变化时递增，用于触发选择 sessions 的组件重渲染
  version: number
  // 是否已从后端加载完成
  loaded: boolean
}

export interface ChatStoreState {
  projects: Record<string, ChatProjectState>
  ensure: (projectId: string, initializer?: () => Partial<ChatProjectState>) => void
  loadFromBackend: (projectId: string) => Promise<void>
  setSessions: (projectId: string, sessions: Session[]) => void
  setActiveSessionId: (projectId: string, sessionId: string) => void
  addSession: (projectId: string, session: Session) => void
  removeSession: (projectId: string, sessionId: string) => void
  updateSessionTitle: (projectId: string, sessionId: string, title: string) => void
  archiveSession: (projectId: string, sessionId: string, archived: boolean) => void
  appendMessages: (projectId: string, sessionId: string, messages: Message[]) => void
  applyRunnerEvent: (projectId: string, event: RunnerEvent) => void
  // 新增：批量应用多个 Runner 事件，减少 React 重渲染次数
  applyRunnerEventsBatch: (projectId: string, events: RunnerEvent[]) => void
  // 将本地状态同步到后端
  syncToBackend: (projectId: string, sessionId: string) => Promise<void>
  // 同步单个消息到后端（用于 runner 完成后保存结果）
  syncMessageToBackend: (
    projectId: string,
    sessionId: string,
    messageId: string,
    immediate?: boolean
  ) => void
  reset: (projectId: string) => void
}

export const defaultChatProjectState = (): ChatProjectState => ({
  sessions: [],
  activeSessionId: null,
  traceIndex: {},
  version: 0,
  loaded: false
})

export const useProjectChatStore = create<ChatStoreState>()(
  persist(
    subscribeWithSelector(
      immer<ChatStoreState>((set, get) => ({
        projects: {},
        ensure: (projectId, initializer) =>
          set((state) => {
            const current = state.projects[projectId]
            if (current) {
              // 确保关键字段存在（处理从旧版本持久化恢复的状态）
              if (!current.traceIndex) {
                current.traceIndex = {}
              }
              if (!initializer) return
              const patch = initializer() ?? {}
              Object.assign(current, patch)
              return
            }
            const initial = { ...defaultChatProjectState(), ...(initializer?.() ?? {}) }
            state.projects[projectId] = initial
          }),
        loadFromBackend: async (projectId) => {
          const api = getSessionsApi()
          if (!api) {
            log.warn('sessions-api-unavailable', { projectId })
            // API 不可用时也标记为已加载，避免卡住
            set((state) => {
              const ws = state.projects[projectId]
              if (ws) ws.loaded = true
            })
            return
          }
          try {
            const sessions = await api.list.call({ projectId })
            set((state) => {
              const ws = state.projects[projectId]
              if (!ws) {
                state.projects[projectId] = {
                  ...defaultChatProjectState(),
                  sessions,
                  loaded: true
                }
              } else {
                ws.sessions = sessions
                ws.loaded = true
              }
              // 重建所有 session 的索引
              const wsRef = state.projects[projectId]
              wsRef.traceIndex = {}
              for (const session of wsRef.sessions) {
                buildTraceIndex(session, session.id, wsRef.traceIndex)
              }
              // 如果当前没有活跃 session，选择第一个
              if (!wsRef.activeSessionId && wsRef.sessions.length > 0) {
                wsRef.activeSessionId = wsRef.sessions[0].id
              }
              wsRef.version += 1
            })
            log.info('sessions-loaded', { projectId, count: sessions.length })
          } catch (err) {
            log.error('sessions-load-failed', err instanceof Error ? err : undefined, {
              projectId
            })
            // 加载失败时也标记为已加载，避免卡住
            set((state) => {
              const ws = state.projects[projectId]
              if (ws) ws.loaded = true
            })
          }
        },
        setSessions: (projectId, sessions) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) {
              state.projects[projectId] = {
                ...defaultChatProjectState(),
                sessions
              }
            } else {
              ws.sessions = sessions
            }
            const wsRef = state.projects[projectId]
            // 重建索引
            wsRef.traceIndex = {}
            for (const session of sessions) {
              buildTraceIndex(session, session.id, wsRef.traceIndex)
            }
            wsRef.version += 1
          }),
        setActiveSessionId: (projectId, sessionId) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.activeSessionId = sessionId
          }),
        addSession: (projectId, session) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.sessions.push(session)
            ws.activeSessionId = session.id
            // 建立新 session 的索引
            buildTraceIndex(session, session.id, ws.traceIndex)
            // 触发观察 sessions 的组件更新
            ws.version += 1
          }),
        removeSession: (projectId, sessionId) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.sessions = ws.sessions.filter((s) => s.id !== sessionId)
            // 清理相关的 traceIndex
            const keysToDelete = Object.entries(ws.traceIndex)
              .filter(([, ref]) => ref.sessionId === sessionId)
              .map(([key]) => key)
            for (const key of keysToDelete) {
              delete ws.traceIndex[key]
            }
            // 如果删除的是当前活跃 session，切换到第一个
            if (ws.activeSessionId === sessionId) {
              ws.activeSessionId = ws.sessions[0]?.id ?? null
            }
            ws.version += 1
          }),
        updateSessionTitle: (projectId, sessionId, title) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            const session = ws.sessions.find((s) => s.id === sessionId)
            if (!session) return
            session.title = title
            ws.version += 1
          }),
        archiveSession: (projectId, sessionId, archived) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            const session = ws.sessions.find((s) => s.id === sessionId)
            if (!session) return
            session.archived = archived
            ws.version += 1
          }),
        appendMessages: (projectId, sessionId, messages) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            const session = ws.sessions.find((s) => s.id === sessionId)
            if (!session) {
              log.error('session-not-found-in-append', undefined, {
                projectId,
                sessionId
              })
              return
            }
            // 记录新消息的索引
            messages.forEach((msg, index) => {
              if (msg.traceId) {
                ws.traceIndex[msg.traceId] = {
                  sessionId,
                  messageIndex: session.messages.length + index
                }
              }
            })
            session.messages.push(...messages)
            // 触发观察 sessions 的组件更新（例如让消息列表实时刷新）
            ws.version += 1
          }),
        applyRunnerEvent: (projectId, event) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return

            // 使用索引快速定位 O(1) 而不是 O(n*m)
            const traceRef = ws.traceIndex[event.traceId]
            if (!traceRef) {
              // 如果没有找到索引，回退到全量扫描（适用于旧数据或特殊情况）
              updateMessageByTraceId(
                ws.sessions,
                event.traceId,
                (_session, message) => {
                  const updatedMsg = applyEventToMessage(message, event)
                  Object.assign(message, updatedMsg)
                  return {
                    shouldUpdateIndex: true,
                    isContextEvent: event.type === 'context',
                    contextId: event.type === 'context' ? event.contextId : undefined
                  }
                },
                { workspace: ws }
              )
              return
            }

            // 快速路径：直接通过索引访问
            const session = ws.sessions.find((s) => s.id === traceRef.sessionId)
            if (!session) return

            const msg = session.messages[traceRef.messageIndex]
            if (!msg || msg.traceId !== event.traceId) {
              // 索引失效，回退到全量扫描
              updateMessageByTraceId(
                ws.sessions,
                event.traceId,
                (_session, message) => {
                  const updatedMsg = applyEventToMessage(message, event)
                  Object.assign(message, updatedMsg)
                  return { shouldUpdateIndex: true }
                },
                { workspace: ws }
              )
              return
            }

            const updatedMsg = applyEventToMessage(msg, event)
            Object.assign(msg, updatedMsg)
            // 如果是上下文标识事件，同时写回会话级 runnerContexts，便于下次 resume
            if (event.type === 'context' && event.contextId && msg.runner) {
              if (!session.runnerContexts) {
                session.runnerContexts = {}
              }
              session.runnerContexts[msg.runner] = event.contextId
            }
            // 消息内容发生变化，递增版本触发 UI 更新
            ws.version += 1
          }),
        applyRunnerEventsBatch: (projectId, events) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return

            // 批量处理多个事件，只触发一次 set
            events.forEach((event) => {
              const traceRef = ws.traceIndex[event.traceId]
              if (!traceRef) {
                // 回退到全量扫描
                updateMessageByTraceId(
                  ws.sessions,
                  event.traceId,
                  (_session, message) => {
                    const updatedMsg = applyEventToMessage(message, event)
                    Object.assign(message, updatedMsg)
                    return {
                      shouldUpdateIndex: true,
                      isContextEvent: event.type === 'context',
                      contextId: event.type === 'context' ? event.contextId : undefined
                    }
                  },
                  { workspace: ws }
                )
                return
              }

              const session = ws.sessions.find((s) => s.id === traceRef.sessionId)
              if (!session) return

              const msg = session.messages[traceRef.messageIndex]
              if (!msg || msg.traceId !== event.traceId) {
                // 索引失效，回退
                updateMessageByTraceId(
                  ws.sessions,
                  event.traceId,
                  (_session, message) => {
                    const updatedMsg = applyEventToMessage(message, event)
                    Object.assign(message, updatedMsg)
                    return { shouldUpdateIndex: true }
                  },
                  { workspace: ws }
                )
                return
              }

              const updatedMsg = applyEventToMessage(msg, event)
              Object.assign(msg, updatedMsg)
              if (event.type === 'context' && event.contextId && msg.runner) {
                if (!session.runnerContexts) {
                  session.runnerContexts = {}
                }
                session.runnerContexts[msg.runner] = event.contextId
              }
            })
            // 批量事件处理后，仅递增一次版本，减少渲染次数
            ws.version += 1
          }),
        syncToBackend: async (projectId, sessionId) => {
          const api = getSessionsApi()
          if (!api) {
            log.warn('sessions-api-unavailable-for-sync', { projectId, sessionId })
            return
          }
          const ws = get().projects[projectId]
          if (!ws) return
          const session = ws.sessions.find((s) => s.id === sessionId)
          if (!session) return

          try {
            // 先更新 session 的基本信息（包括 runnerContexts）
            await api.update.call({
              projectId,
              sessionId,
              title: session.title,
              runnerContexts: session.runnerContexts
            })
            // 然后同步所有消息（使用 appendMessages 会重复，所以这里只更新整个 session）
            // 由于后端没有 replaceMessages API，我们通过删除再创建的方式实现
            // 但这不太好，让我们改用一个更好的方式：只在消息完成时同步
            log.info('session-synced', { projectId, sessionId })
          } catch (err) {
            log.error('session-sync-failed', err instanceof Error ? err : undefined, {
              projectId,
              sessionId
            })
          }
        },
        syncMessageToBackend: (projectId, sessionId, messageId, immediate = false) => {
          const queueKey = `${projectId}:${sessionId}:${messageId}`

          // 清除已有的延迟同步
          const existingTimeout = messageSyncQueue.get(queueKey)
          if (existingTimeout) {
            clearTimeout(existingTimeout)
          }

          const doSync = async () => {
            messageSyncQueue.delete(queueKey)

            const api = getSessionsApi()
            if (!api) {
              log.warn('sessions-api-unavailable-for-message-sync', {
                projectId,
                sessionId,
                messageId
              })
              return
            }

            const ws = get().projects[projectId]
            if (!ws) return

            const session = ws.sessions.find((s) => s.id === sessionId)
            if (!session) return

            const message = session.messages.find((m) => m.id === messageId)
            if (!message) return

            try {
              await api.updateMessage.call({
                projectId,
                sessionId,
                messageId,
                patch: {
                  content: message.content,
                  status: message.status,
                  logs: message.logs,
                  output: message.output,
                  errorMessage: message.errorMessage,
                  runner: message.runner
                }
              })
              log.debug('message-synced', { projectId, sessionId, messageId })
            } catch (err) {
              log.error('message-sync-failed', err instanceof Error ? err : undefined, {
                projectId,
                sessionId,
                messageId
              })
            }
          }

          if (immediate) {
            void doSync()
          } else {
            // 防抖：500ms 后执行同步
            const timeout = setTimeout(() => void doSync(), 500)
            messageSyncQueue.set(queueKey, timeout)
          }
        },
        reset: (projectId) =>
          set((state) => {
            delete state.projects[projectId]
          })
      }))
    ),
    {
      name: 'rantcode.workspace.chat',
      version: 2, // 升级版本号，因为添加了新功能
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ projects: state.projects }),
      // 从 localStorage 恢复状态后，修复那些异常的 running 状态
      // 应用重启后，之前运行的任务不可能还在运行
      onRehydrateStorage: () => (state) => {
        if (!state) return
        for (const projectId in state.projects) {
          const ws = state.projects[projectId]
          // 重置 loaded 状态，强制从后端重新加载
          ws.loaded = false
          for (const session of ws.sessions) {
            for (const msg of session.messages) {
              if (msg.status === 'running') {
                msg.status = 'error'
                msg.errorMessage = '任务被中断（应用重启）'
              }
            }
          }
        }
      }
    }
  )
)
