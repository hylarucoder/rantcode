import { useCallback, useEffect, useRef } from 'react'
import type { Message, Session, RunnerContextMap } from '@/features/workspace/types'
import type { RunnerEvent } from '@shared/types/webui'
import { useProjectChatStore, getSessionsApi, EMPTY_SESSIONS } from '../chatStore'

// oRPC sessions namespace type (局部类型，用于类型推断)
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
      const api = getSessionsApi() as SessionsNamespace | null
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
      const api = getSessionsApi() as SessionsNamespace | null
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
      const api = getSessionsApi() as SessionsNamespace | null
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
      const api = getSessionsApi() as SessionsNamespace | null
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
      const api = getSessionsApi() as SessionsNamespace | null
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
