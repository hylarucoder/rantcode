import { useCallback, useEffect, useRef } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { Message, Session, RightPanelTab, RunnerContextMap } from '@/features/workspace/types'
import type { RunnerEvent } from '@shared/types/webui'
import { orpc } from '@/lib/orpcQuery'

// 稳定的空列表，避免 selector 在工作区未初始化时返回新引用导致不必要的重渲染
const EMPTY_SESSIONS: Session[] = []

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

function getSessionsApi(): SessionsNamespace | null {
  const sessions = (orpc as { sessions?: SessionsNamespace }).sessions
  return sessions ?? null
}

type ChatProjectState = {
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

type PreviewProjectState = {
  selectedDocPath: string | null
  rightTab: RightPanelTab
  previewTocOpen: boolean
}

interface ChatStoreState {
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

interface PreviewStoreState {
  projects: Record<string, PreviewProjectState>
  ensure: (projectId: string, initializer?: () => Partial<PreviewProjectState>) => void
  setSelectedDocPath: (projectId: string, path: string | null) => void
  setRightTab: (projectId: string, tab: RightPanelTab) => void
  setPreviewTocOpen: (projectId: string, open: boolean) => void
  reset: (projectId: string) => void
}

const defaultChatProjectState = (): ChatProjectState => ({
  sessions: [],
  activeSessionId: null,
  traceIndex: {},
  version: 0,
  loaded: false
})

const defaultPreviewProjectState = (): PreviewProjectState => ({
  selectedDocPath: null,
  rightTab: 'preview',
  previewTocOpen: false
})

// 构建 traceId -> message 索引
function buildTraceIndex(
  session: Session,
  sessionId: string,
  index: Record<string, { sessionId: string; messageIndex: number }>
) {
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
function updateMessageByTraceId(
  sessions: Session[],
  traceId: string,
  updateFn: (
    session: Session,
    message: Message,
    messageIndex: number
  ) => { shouldUpdateIndex: boolean; isContextEvent?: boolean; contextId?: string },
  options?: { workspace?: ChatProjectState }
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

function applyEventToMessage(msg: Message, event: RunnerEvent): Message {
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
            console.warn('[sessions] oRPC sessions API not available')
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
            console.log(`[sessions] Loaded ${sessions.length} sessions from backend`)
          } catch (err) {
            console.error('[sessions] Failed to load from backend:', err)
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
              console.error(`Session ${sessionId} not found in workspace ${projectId}`)
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
            console.warn('[sessions] oRPC sessions API not available for sync')
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
            console.log(`[sessions] Synced session ${sessionId} to backend`)
          } catch (err) {
            console.error('[sessions] Failed to sync to backend:', err)
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
              console.warn('[sessions] oRPC sessions API not available for message sync')
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
              console.log(`[sessions] Message ${messageId} synced to backend`)
            } catch (err) {
              console.error('[sessions] Failed to sync message to backend:', err)
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

export const useProjectPreviewStore = create<PreviewStoreState>()(
  persist(
    subscribeWithSelector(
      immer<PreviewStoreState>((set) => ({
        projects: {},
        ensure: (projectId, initializer) =>
          set((state) => {
            const current = state.projects[projectId]
            if (current) {
              if (!initializer) return
              const patch = initializer() ?? {}
              Object.assign(current, patch)
              return
            }
            const initial = { ...defaultPreviewProjectState(), ...(initializer?.() ?? {}) }
            state.projects[projectId] = initial
          }),
        setSelectedDocPath: (projectId, path) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.selectedDocPath = path
          }),
        setRightTab: (projectId, tab) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.rightTab = tab
          }),
        setPreviewTocOpen: (projectId, open) =>
          set((state) => {
            const ws = state.projects[projectId]
            if (!ws) return
            ws.previewTocOpen = open
          }),
        reset: (projectId) =>
          set((state) => {
            delete state.projects[projectId]
          })
      }))
    ),
    {
      name: 'rantcode.workspace.preview',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ projects: state.projects })
    }
  )
)

export function useProjectChat(projectId: string) {
  // 使用 subscribeWithSelector 的选择性订阅能力
  const sessions = useProjectChatStore((s) => s.projects[projectId]?.sessions ?? EMPTY_SESSIONS)
  // 额外订阅 version，用于驱动日志等流式更新的刷新；无需显式使用其值
  const _version = useProjectChatStore((s) => s.projects[projectId]?.version ?? 0)
  void _version
  const activeSessionId = useProjectChatStore((s) => s.projects[projectId]?.activeSessionId ?? null)
  // 是否已从后端加载完成
  const loaded = useProjectChatStore((s) => s.projects[projectId]?.loaded ?? false)
  const ensure = useProjectChatStore((s) => s.ensure)
  const loadFromBackend = useProjectChatStore((s) => s.loadFromBackend)
  const setSessions = useProjectChatStore((s) => s.setSessions)
  const setActiveSessionId = useProjectChatStore((s) => s.setActiveSessionId)
  const addSessionStore = useProjectChatStore((s) => s.addSession)
  const removeSessionStore = useProjectChatStore((s) => s.removeSession)
  const updateSessionTitleStore = useProjectChatStore((s) => s.updateSessionTitle)
  const archiveSessionStore = useProjectChatStore((s) => s.archiveSession)
  const appendMessagesStore = useProjectChatStore((s) => s.appendMessages)
  const applyRunnerEvent = useProjectChatStore((s) => s.applyRunnerEvent)
  const applyRunnerEventsBatch = useProjectChatStore((s) => s.applyRunnerEventsBatch)
  const syncToBackend = useProjectChatStore((s) => s.syncToBackend)
  const syncMessageToBackendStore = useProjectChatStore((s) => s.syncMessageToBackend)

  // 首次加载：从后端读取 sessions
  const loadedRef = useRef(false)
  useEffect(() => {
    ensure(projectId)
    if (!loadedRef.current) {
      loadedRef.current = true
      void loadFromBackend(projectId)
    }
  }, [projectId, ensure, loadFromBackend])

  // 创建 session 并同步到后端
  // 重要：先在后端创建，使用后端返回的 ID，确保前后端 ID 一致
  const addSession = useCallback(
    async (sessionInput: Omit<Session, 'id'> & { id?: string }) => {
      const api = getSessionsApi()
      if (api) {
        try {
          // 先在后端创建 session，获取后端生成的 ID
          const backendSession = await api.create.call({
            projectId,
            title: sessionInput.title
          })
          // 如果传入了初始消息，需要同步到后端
          const initialMessages = sessionInput.messages || []
          if (initialMessages.length > 0) {
            try {
              await api.appendMessages.call({
                projectId,
                sessionId: backendSession.id,
                messages: initialMessages
              })
              backendSession.messages = initialMessages
            } catch (msgErr) {
              console.error('[sessions] Failed to append initial messages:', msgErr)
              // 即使消息同步失败，也把消息添加到本地
              backendSession.messages = initialMessages
            }
          }
          // 使用后端返回的 session（包含后端生成的 ID）
          addSessionStore(projectId, backendSession)
          return backendSession
        } catch (err) {
          console.error('[sessions] Failed to create session in backend:', err)
          // 后端失败时，仍然在本地创建（使用传入的 ID 或生成新的）
          const localSession: Session = {
            id: sessionInput.id || crypto.randomUUID(),
            title: sessionInput.title,
            messages: sessionInput.messages || []
          }
          addSessionStore(projectId, localSession)
          return localSession
        }
      } else {
        // 没有 API 时，在本地创建
        const localSession: Session = {
          id: sessionInput.id || crypto.randomUUID(),
          title: sessionInput.title,
          messages: sessionInput.messages || []
        }
        addSessionStore(projectId, localSession)
        return localSession
      }
    },
    [projectId, addSessionStore]
  )

  // 删除 session 并同步到后端
  const removeSession = useCallback(
    async (sessionId: string) => {
      removeSessionStore(projectId, sessionId)
      const api = getSessionsApi()
      if (api) {
        try {
          await api.delete.call({ projectId, sessionId })
        } catch (err) {
          console.error('[sessions] Failed to delete session in backend:', err)
        }
      }
    },
    [projectId, removeSessionStore]
  )

  // 更新 session 标题并同步到后端
  const updateSessionTitle = useCallback(
    async (sessionId: string, title: string) => {
      updateSessionTitleStore(projectId, sessionId, title)
      const api = getSessionsApi()
      if (api) {
        try {
          await api.update.call({ projectId, sessionId, title })
        } catch (err) {
          console.error('[sessions] Failed to update session title in backend:', err)
        }
      }
    },
    [projectId, updateSessionTitleStore]
  )

  // 归档/取消归档 session 并同步到后端
  const archiveSession = useCallback(
    async (sessionId: string, archived: boolean) => {
      archiveSessionStore(projectId, sessionId, archived)
      const api = getSessionsApi()
      if (api) {
        try {
          await api.update.call({ projectId, sessionId, archived })
        } catch (err) {
          console.error('[sessions] Failed to archive session in backend:', err)
        }
      }
    },
    [projectId, archiveSessionStore]
  )

  // 添加消息并同步到后端
  const appendMessages = useCallback(
    async (sessionId: string, messages: Message[]) => {
      appendMessagesStore(projectId, sessionId, messages)
      // 异步同步到后端
      const api = getSessionsApi()
      if (api) {
        try {
          await api.appendMessages.call({ projectId, sessionId, messages })
        } catch (err) {
          console.error('[sessions] Failed to append messages in backend:', err)
        }
      }
    },
    [projectId, appendMessagesStore]
  )

  // 重新加载
  const reload = useCallback(() => {
    void loadFromBackend(projectId)
  }, [projectId, loadFromBackend])

  return {
    sessions,
    activeSessionId,
    loaded,
    ensure,
    reload,
    setSessions: (sessions: Session[]) => setSessions(projectId, sessions),
    setActiveSessionId: (id: string) => setActiveSessionId(projectId, id),
    addSession,
    removeSession,
    updateSessionTitle,
    archiveSession,
    appendMessages,
    applyRunnerEvent: (event: RunnerEvent) => applyRunnerEvent(projectId, event),
    // 批量应用事件，减少渲染次数
    applyRunnerEventsBatch: (events: RunnerEvent[]) => applyRunnerEventsBatch(projectId, events),
    // 手动同步到后端
    syncToBackend: (sessionId: string) => syncToBackend(projectId, sessionId),
    // 同步单个消息到后端
    syncMessageToBackend: (sessionId: string, messageId: string, immediate?: boolean) =>
      syncMessageToBackendStore(projectId, sessionId, messageId, immediate)
  }
}

export function useProjectPreview(projectId: string) {
  const selectedDocPath = useProjectPreviewStore(
    (s) => s.projects[projectId]?.selectedDocPath ?? null
  )
  const rightTab = useProjectPreviewStore((s) => s.projects[projectId]?.rightTab ?? 'preview')
  const previewTocOpen = useProjectPreviewStore(
    (s) => s.projects[projectId]?.previewTocOpen ?? false
  )
  const setSelectedDocPath = useProjectPreviewStore((s) => s.setSelectedDocPath)
  const setRightTab = useProjectPreviewStore((s) => s.setRightTab)
  const setPreviewTocOpen = useProjectPreviewStore((s) => s.setPreviewTocOpen)
  const ensure = useProjectPreviewStore((s) => s.ensure)
  useEffect(() => {
    ensure(projectId)
  }, [projectId, ensure])
  return {
    selectedDocPath,
    rightTab,
    previewTocOpen,
    setSelectedDocPath: (path: string | null) => setSelectedDocPath(projectId, path),
    setRightTab: (tab: RightPanelTab) => setRightTab(projectId, tab),
    setPreviewTocOpen: (open: boolean) => setPreviewTocOpen(projectId, open)
  }
}
