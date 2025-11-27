import { useCallback, useEffect, useRef } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { ChatMessage, ChatSession, RightPanelTab } from '@/features/workspace/types'
import type { CodexEvent } from '@shared/types/webui'
import { orpc } from '@/lib/orpcQuery'

// 稳定的空列表，避免 selector 在工作区未初始化时返回新引用导致不必要的重渲染
const EMPTY_SESSIONS: ChatSession[] = []

// oRPC sessions namespace type
type SessionsNamespace = {
  list: { call: (input: { workspaceId: string }) => Promise<ChatSession[]> }
  create: { call: (input: { workspaceId: string; title?: string }) => Promise<ChatSession> }
  update: {
    call: (input: {
      workspaceId: string
      sessionId: string
      title?: string
      codexSessionId?: string
    }) => Promise<ChatSession>
  }
  delete: { call: (input: { workspaceId: string; sessionId: string }) => Promise<{ ok: boolean }> }
  appendMessages: {
    call: (input: {
      workspaceId: string
      sessionId: string
      messages: ChatMessage[]
    }) => Promise<ChatSession>
  }
  updateMessage: {
    call: (input: {
      workspaceId: string
      sessionId: string
      messageId: string
      patch: Partial<ChatMessage>
    }) => Promise<ChatSession>
  }
}

function getSessionsApi(): SessionsNamespace | null {
  const sessions = (orpc as { sessions?: SessionsNamespace }).sessions
  return sessions ?? null
}

type ChatWorkspaceState = {
  sessions: ChatSession[]
  activeSessionId: string | null
  // 添加索引：jobId -> { sessionId, messageIndex }
  // 使用对象而不是 Map，因为 Map 不能被序列化
  jobIndex: Record<string, { sessionId: string; messageIndex: number }>
  // 细粒度更新计数器：当消息内容流式变化时递增，用于触发选择 sessions 的组件重渲染
  version: number
}

type PreviewWorkspaceState = {
  selectedDocPath: string | null
  rightTab: RightPanelTab
  previewTocOpen: boolean
}

interface ChatStoreState {
  workspaces: Record<string, ChatWorkspaceState>
  ensure: (workspaceId: string, initializer?: () => Partial<ChatWorkspaceState>) => void
  loadFromBackend: (workspaceId: string) => Promise<void>
  setSessions: (workspaceId: string, sessions: ChatSession[]) => void
  setActiveSessionId: (workspaceId: string, sessionId: string) => void
  addSession: (workspaceId: string, session: ChatSession) => void
  removeSession: (workspaceId: string, sessionId: string) => void
  updateSessionTitle: (workspaceId: string, sessionId: string, title: string) => void
  appendMessages: (workspaceId: string, sessionId: string, messages: ChatMessage[]) => void
  applyCodexEvent: (workspaceId: string, event: CodexEvent) => void
  // 新增：批量应用多个 Codex 事件，减少 React 重渲染次数
  applyCodexEventsBatch: (workspaceId: string, events: CodexEvent[]) => void
  // 将本地状态同步到后端
  syncToBackend: (workspaceId: string, sessionId: string) => Promise<void>
  reset: (workspaceId: string) => void
}

interface PreviewStoreState {
  workspaces: Record<string, PreviewWorkspaceState>
  ensure: (workspaceId: string, initializer?: () => Partial<PreviewWorkspaceState>) => void
  setSelectedDocPath: (workspaceId: string, path: string | null) => void
  setRightTab: (workspaceId: string, tab: RightPanelTab) => void
  setPreviewTocOpen: (workspaceId: string, open: boolean) => void
  reset: (workspaceId: string) => void
}

const defaultChatWorkspaceState = (): ChatWorkspaceState => ({
  sessions: [],
  activeSessionId: null,
  jobIndex: {},
  version: 0
})

const defaultPreviewWorkspaceState = (): PreviewWorkspaceState => ({
  selectedDocPath: null,
  rightTab: 'preview',
  previewTocOpen: false
})

// 构建 jobId -> message 索引
function buildJobIndex(
  session: ChatSession,
  sessionId: string,
  index: Record<string, { sessionId: string; messageIndex: number }>
) {
  session.messages.forEach((msg, msgIndex) => {
    if (msg.jobId) {
      index[msg.jobId] = { sessionId, messageIndex: msgIndex }
    }
  })
}

/**
 * 通过 jobId 查找并更新消息的统一函数
 * @param sessions 所有会话
 * @param jobId 要查找的 jobId
 * @param updateFn 更新回调，返回更新结果
 * @param options 可选项，包含 workspace 引用以更新索引
 * @returns 是否找到并更新了消息
 */
function updateMessageByJobId(
  sessions: ChatSession[],
  jobId: string,
  updateFn: (
    session: ChatSession,
    message: ChatMessage,
    messageIndex: number
  ) => { shouldUpdateIndex: boolean; isSessionEvent?: boolean; sessionId?: string },
  options?: { workspace?: ChatWorkspaceState }
): boolean {
  for (const session of sessions) {
    const messageIndex = session.messages.findIndex((msg) => msg.jobId === jobId)
    if (messageIndex !== -1) {
      const message = session.messages[messageIndex]
      const result = updateFn(session, message, messageIndex)

      // 如果是会话标识事件，更新会话级别的 codexSessionId
      if (result.isSessionEvent && result.sessionId) {
        session.codexSessionId = result.sessionId
      }

      // 更新索引
      if (result.shouldUpdateIndex && options?.workspace?.jobIndex) {
        options.workspace.jobIndex[jobId] = {
          sessionId: session.id,
          messageIndex
        }
      }
      return true
    }
  }
  return false
}

function applyEventToMessage(msg: ChatMessage, event: CodexEvent): ChatMessage {
  if (!msg.jobId || msg.jobId !== event.jobId) return msg
  switch (event.type) {
    case 'session':
      return { ...msg, sessionId: event.sessionId }
    case 'log': {
      const entry = {
        id: `${event.jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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

export const useWorkspaceChatStore = create<ChatStoreState>()(
  persist(
    subscribeWithSelector(
      immer<ChatStoreState>((set, get) => ({
        workspaces: {},
        ensure: (workspaceId, initializer) =>
          set((state) => {
            const current = state.workspaces[workspaceId]
            if (current) {
              if (!initializer) return
              const patch = initializer() ?? {}
              Object.assign(current, patch)
              return
            }
            const initial = { ...defaultChatWorkspaceState(), ...(initializer?.() ?? {}) }
            state.workspaces[workspaceId] = initial
          }),
        loadFromBackend: async (workspaceId) => {
          const api = getSessionsApi()
          if (!api) {
            console.warn('[sessions] oRPC sessions API not available')
            return
          }
          try {
            const sessions = await api.list.call({ workspaceId })
            set((state) => {
              const ws = state.workspaces[workspaceId]
              if (!ws) {
                state.workspaces[workspaceId] = {
                  ...defaultChatWorkspaceState(),
                  sessions
                }
              } else {
                ws.sessions = sessions
              }
              // 重建所有 session 的索引
              const wsRef = state.workspaces[workspaceId]
              wsRef.jobIndex = {}
              for (const session of wsRef.sessions) {
                buildJobIndex(session, session.id, wsRef.jobIndex)
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
          }
        },
        setSessions: (workspaceId, sessions) =>
          set((state) => {
            const ws = state.workspaces[workspaceId]
            if (!ws) {
              state.workspaces[workspaceId] = {
                ...defaultChatWorkspaceState(),
                sessions
              }
            } else {
              ws.sessions = sessions
            }
            const wsRef = state.workspaces[workspaceId]
            // 重建索引
            wsRef.jobIndex = {}
            for (const session of sessions) {
              buildJobIndex(session, session.id, wsRef.jobIndex)
            }
            wsRef.version += 1
          }),
        setActiveSessionId: (workspaceId, sessionId) =>
          set((state) => {
            const ws = state.workspaces[workspaceId]
            if (!ws) return
            ws.activeSessionId = sessionId
          }),
        addSession: (workspaceId, session) =>
          set((state) => {
            const ws = state.workspaces[workspaceId]
            if (!ws) return
            ws.sessions.push(session)
            ws.activeSessionId = session.id
            // 建立新 session 的索引
            buildJobIndex(session, session.id, ws.jobIndex)
            // 触发观察 sessions 的组件更新
            ws.version += 1
          }),
        removeSession: (workspaceId, sessionId) =>
          set((state) => {
            const ws = state.workspaces[workspaceId]
            if (!ws) return
            ws.sessions = ws.sessions.filter((s) => s.id !== sessionId)
            // 清理相关的 jobIndex
            const keysToDelete = Object.entries(ws.jobIndex)
              .filter(([, ref]) => ref.sessionId === sessionId)
              .map(([key]) => key)
            for (const key of keysToDelete) {
              delete ws.jobIndex[key]
            }
            // 如果删除的是当前活跃 session，切换到第一个
            if (ws.activeSessionId === sessionId) {
              ws.activeSessionId = ws.sessions[0]?.id ?? null
            }
            ws.version += 1
          }),
        updateSessionTitle: (workspaceId, sessionId, title) =>
          set((state) => {
            const ws = state.workspaces[workspaceId]
            if (!ws) return
            const session = ws.sessions.find((s) => s.id === sessionId)
            if (!session) return
            session.title = title
            ws.version += 1
          }),
        appendMessages: (workspaceId, sessionId, messages) =>
          set((state) => {
            const ws = state.workspaces[workspaceId]
            if (!ws) return
            const session = ws.sessions.find((s) => s.id === sessionId)
            if (!session) {
              console.error(`Session ${sessionId} not found in workspace ${workspaceId}`)
              return
            }
            // 记录新消息的索引
            messages.forEach((msg, index) => {
              if (msg.jobId) {
                ws.jobIndex[msg.jobId] = {
                  sessionId,
                  messageIndex: session.messages.length + index
                }
              }
            })
            session.messages.push(...messages)
            // 触发观察 sessions 的组件更新（例如让消息列表实时刷新）
            ws.version += 1
          }),
        applyCodexEvent: (workspaceId, event) =>
          set((state) => {
            const ws = state.workspaces[workspaceId]
            if (!ws) return

            // 使用索引快速定位 O(1) 而不是 O(n*m)
            const jobRef = ws.jobIndex[event.jobId]
            if (!jobRef) {
              // 如果没有找到索引，回退到全量扫描（适用于旧数据或特殊情况）
              updateMessageByJobId(
                ws.sessions,
                event.jobId,
                (_session, message) => {
                  const updatedMsg = applyEventToMessage(message, event)
                  Object.assign(message, updatedMsg)
                  return {
                    shouldUpdateIndex: true,
                    isSessionEvent: event.type === 'session',
                    sessionId: event.type === 'session' ? event.sessionId : undefined
                  }
                },
                { workspace: ws }
              )
              return
            }

            // 快速路径：直接通过索引访问
            const session = ws.sessions.find((s) => s.id === jobRef.sessionId)
            if (!session) return

            const msg = session.messages[jobRef.messageIndex]
            if (!msg || msg.jobId !== event.jobId) {
              // 索引失效，回退到全量扫描
              updateMessageByJobId(
                ws.sessions,
                event.jobId,
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
            // 如果是会话标识事件，同时写回会话级 codexSessionId，便于下次 resume
            if (event.type === 'session' && event.sessionId) {
              session.codexSessionId = event.sessionId
            }
            // 消息内容发生变化，递增版本触发 UI 更新
            ws.version += 1
          }),
        applyCodexEventsBatch: (workspaceId, events) =>
          set((state) => {
            const ws = state.workspaces[workspaceId]
            if (!ws) return

            // 批量处理多个事件，只触发一次 set
            events.forEach((event) => {
              const jobRef = ws.jobIndex[event.jobId]
              if (!jobRef) {
                // 回退到全量扫描
                updateMessageByJobId(
                  ws.sessions,
                  event.jobId,
                  (_session, message) => {
                    const updatedMsg = applyEventToMessage(message, event)
                    Object.assign(message, updatedMsg)
                    return {
                      shouldUpdateIndex: true,
                      isSessionEvent: event.type === 'session',
                      sessionId: event.type === 'session' ? event.sessionId : undefined
                    }
                  },
                  { workspace: ws }
                )
                return
              }

              const session = ws.sessions.find((s) => s.id === jobRef.sessionId)
              if (!session) return

              const msg = session.messages[jobRef.messageIndex]
              if (!msg || msg.jobId !== event.jobId) {
                // 索引失效，回退
                updateMessageByJobId(
                  ws.sessions,
                  event.jobId,
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
              if (event.type === 'session' && event.sessionId) {
                session.codexSessionId = event.sessionId
              }
            })
            // 批量事件处理后，仅递增一次版本，减少渲染次数
            ws.version += 1
          }),
        syncToBackend: async (workspaceId, sessionId) => {
          const api = getSessionsApi()
          if (!api) {
            console.warn('[sessions] oRPC sessions API not available for sync')
            return
          }
          const ws = get().workspaces[workspaceId]
          if (!ws) return
          const session = ws.sessions.find((s) => s.id === sessionId)
          if (!session) return

          try {
            // 先更新 session 的基本信息（包括 codexSessionId）
            await api.update.call({
              workspaceId,
              sessionId,
              title: session.title,
              codexSessionId: session.codexSessionId
            })
            // 然后同步所有消息（使用 appendMessages 会重复，所以这里只更新整个 session）
            // 由于后端没有 replaceMessages API，我们通过删除再创建的方式实现
            // 但这不太好，让我们改用一个更好的方式：只在消息完成时同步
            console.log(`[sessions] Synced session ${sessionId} to backend`)
          } catch (err) {
            console.error('[sessions] Failed to sync to backend:', err)
          }
        },
        reset: (workspaceId) =>
          set((state) => {
            delete state.workspaces[workspaceId]
          })
      }))
    ),
    {
      name: 'rantcode.workspace.chat',
      version: 2, // 升级版本号，因为添加了新功能
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ workspaces: state.workspaces })
    }
  )
)

export const useWorkspacePreviewStore = create<PreviewStoreState>()(
  persist(
    subscribeWithSelector(
      immer<PreviewStoreState>((set) => ({
        workspaces: {},
        ensure: (workspaceId, initializer) =>
          set((state) => {
            const current = state.workspaces[workspaceId]
            if (current) {
              if (!initializer) return
              const patch = initializer() ?? {}
              Object.assign(current, patch)
              return
            }
            const initial = { ...defaultPreviewWorkspaceState(), ...(initializer?.() ?? {}) }
            state.workspaces[workspaceId] = initial
          }),
        setSelectedDocPath: (workspaceId, path) =>
          set((state) => {
            const ws = state.workspaces[workspaceId]
            if (!ws) return
            ws.selectedDocPath = path
          }),
        setRightTab: (workspaceId, tab) =>
          set((state) => {
            const ws = state.workspaces[workspaceId]
            if (!ws) return
            ws.rightTab = tab
          }),
        setPreviewTocOpen: (workspaceId, open) =>
          set((state) => {
            const ws = state.workspaces[workspaceId]
            if (!ws) return
            ws.previewTocOpen = open
          }),
        reset: (workspaceId) =>
          set((state) => {
            delete state.workspaces[workspaceId]
          })
      }))
    ),
    {
      name: 'rantcode.workspace.preview',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ workspaces: state.workspaces })
    }
  )
)

export function useWorkspaceChat(workspaceId: string) {
  // 使用 subscribeWithSelector 的选择性订阅能力
  const sessions = useWorkspaceChatStore(
    (s) => s.workspaces[workspaceId]?.sessions ?? EMPTY_SESSIONS
  )
  // 额外订阅 version，用于驱动日志等流式更新的刷新；无需显式使用其值
  const _version = useWorkspaceChatStore((s) => s.workspaces[workspaceId]?.version ?? 0)
  void _version
  const activeSessionId = useWorkspaceChatStore(
    (s) => s.workspaces[workspaceId]?.activeSessionId ?? null
  )
  const ensure = useWorkspaceChatStore((s) => s.ensure)
  const loadFromBackend = useWorkspaceChatStore((s) => s.loadFromBackend)
  const setSessions = useWorkspaceChatStore((s) => s.setSessions)
  const setActiveSessionId = useWorkspaceChatStore((s) => s.setActiveSessionId)
  const addSessionStore = useWorkspaceChatStore((s) => s.addSession)
  const removeSessionStore = useWorkspaceChatStore((s) => s.removeSession)
  const updateSessionTitleStore = useWorkspaceChatStore((s) => s.updateSessionTitle)
  const appendMessagesStore = useWorkspaceChatStore((s) => s.appendMessages)
  const applyCodexEvent = useWorkspaceChatStore((s) => s.applyCodexEvent)
  const applyCodexEventsBatch = useWorkspaceChatStore((s) => s.applyCodexEventsBatch)
  const syncToBackend = useWorkspaceChatStore((s) => s.syncToBackend)

  // 首次加载：从后端读取 sessions
  const loadedRef = useRef(false)
  useEffect(() => {
    ensure(workspaceId)
    if (!loadedRef.current) {
      loadedRef.current = true
      void loadFromBackend(workspaceId)
    }
  }, [workspaceId, ensure, loadFromBackend])

  // 创建 session 并同步到后端
  // 重要：先在后端创建，使用后端返回的 ID，确保前后端 ID 一致
  const addSession = useCallback(
    async (sessionInput: Omit<ChatSession, 'id'> & { id?: string }) => {
      const api = getSessionsApi()
      if (api) {
        try {
          // 先在后端创建 session，获取后端生成的 ID
          const backendSession = await api.create.call({
            workspaceId,
            title: sessionInput.title
          })
          // 如果传入了初始消息，需要同步到后端
          const initialMessages = sessionInput.messages || []
          if (initialMessages.length > 0) {
            try {
              await api.appendMessages.call({
                workspaceId,
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
          addSessionStore(workspaceId, backendSession)
          return backendSession
        } catch (err) {
          console.error('[sessions] Failed to create session in backend:', err)
          // 后端失败时，仍然在本地创建（使用传入的 ID 或生成新的）
          const localSession: ChatSession = {
            id: sessionInput.id || crypto.randomUUID(),
            title: sessionInput.title,
            messages: sessionInput.messages || []
          }
          addSessionStore(workspaceId, localSession)
          return localSession
        }
      } else {
        // 没有 API 时，在本地创建
        const localSession: ChatSession = {
          id: sessionInput.id || crypto.randomUUID(),
          title: sessionInput.title,
          messages: sessionInput.messages || []
        }
        addSessionStore(workspaceId, localSession)
        return localSession
      }
    },
    [workspaceId, addSessionStore]
  )

  // 删除 session 并同步到后端
  const removeSession = useCallback(
    async (sessionId: string) => {
      removeSessionStore(workspaceId, sessionId)
      const api = getSessionsApi()
      if (api) {
        try {
          await api.delete.call({ workspaceId, sessionId })
        } catch (err) {
          console.error('[sessions] Failed to delete session in backend:', err)
        }
      }
    },
    [workspaceId, removeSessionStore]
  )

  // 更新 session 标题并同步到后端
  const updateSessionTitle = useCallback(
    async (sessionId: string, title: string) => {
      updateSessionTitleStore(workspaceId, sessionId, title)
      const api = getSessionsApi()
      if (api) {
        try {
          await api.update.call({ workspaceId, sessionId, title })
        } catch (err) {
          console.error('[sessions] Failed to update session title in backend:', err)
        }
      }
    },
    [workspaceId, updateSessionTitleStore]
  )

  // 添加消息并同步到后端
  const appendMessages = useCallback(
    async (sessionId: string, messages: ChatMessage[]) => {
      appendMessagesStore(workspaceId, sessionId, messages)
      // 异步同步到后端
      const api = getSessionsApi()
      if (api) {
        try {
          await api.appendMessages.call({ workspaceId, sessionId, messages })
        } catch (err) {
          console.error('[sessions] Failed to append messages in backend:', err)
        }
      }
    },
    [workspaceId, appendMessagesStore]
  )

  // 重新加载
  const reload = useCallback(() => {
    void loadFromBackend(workspaceId)
  }, [workspaceId, loadFromBackend])

  return {
    sessions,
    activeSessionId,
    ensure,
    reload,
    setSessions: (sessions: ChatSession[]) => setSessions(workspaceId, sessions),
    setActiveSessionId: (id: string) => setActiveSessionId(workspaceId, id),
    addSession,
    removeSession,
    updateSessionTitle,
    appendMessages,
    applyCodexEvent: (event: CodexEvent) => applyCodexEvent(workspaceId, event),
    // 批量应用事件，减少渲染次数
    applyCodexEventsBatch: (events: CodexEvent[]) => applyCodexEventsBatch(workspaceId, events),
    // 手动同步到后端
    syncToBackend: (sessionId: string) => syncToBackend(workspaceId, sessionId)
  }
}

export function useWorkspacePreview(workspaceId: string) {
  const selectedDocPath = useWorkspacePreviewStore(
    (s) => s.workspaces[workspaceId]?.selectedDocPath ?? null
  )
  const rightTab = useWorkspacePreviewStore((s) => s.workspaces[workspaceId]?.rightTab ?? 'preview')
  const previewTocOpen = useWorkspacePreviewStore(
    (s) => s.workspaces[workspaceId]?.previewTocOpen ?? false
  )
  const setSelectedDocPath = useWorkspacePreviewStore((s) => s.setSelectedDocPath)
  const setRightTab = useWorkspacePreviewStore((s) => s.setRightTab)
  const setPreviewTocOpen = useWorkspacePreviewStore((s) => s.setPreviewTocOpen)
  const ensure = useWorkspacePreviewStore((s) => s.ensure)
  useEffect(() => {
    ensure(workspaceId)
  }, [workspaceId, ensure])
  return {
    selectedDocPath,
    rightTab,
    previewTocOpen,
    setSelectedDocPath: (path: string | null) => setSelectedDocPath(workspaceId, path),
    setRightTab: (tab: RightPanelTab) => setRightTab(workspaceId, tab),
    setPreviewTocOpen: (open: boolean) => setPreviewTocOpen(workspaceId, open)
  }
}
