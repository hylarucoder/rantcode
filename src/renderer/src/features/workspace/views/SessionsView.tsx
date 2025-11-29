import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { ProjectInfo } from '@/types'
import { WorkspaceLayout } from '@/features/workspace/views/WorkspaceLayout'
import { useAgentRunner } from '@/features/workspace/hooks/useAgentRunner'
import { usePreviewDocument } from '@/features/preview'
import { useProjectChat, useProjectPreview } from '@/features/workspace/state/store'
import { useProjects } from '@/state/projects'
import type { RunnerEvent, RunnerRunOptions } from '@shared/types/webui'
import { toast } from 'sonner'
import { useSfx } from '@/hooks/useSfx'
import type { Message, Session } from '@/features/workspace/types'
import { playAudioFx } from '@/lib/audioFx'
import { getPresetAgent, buildAgentPrompt } from '@shared/agents'
import { useClaudeTokensQuery } from '@/features/settings/api/agentsHooks'
import type { Runner } from '@shared/runners'

/**
 * 获取 runner 对应的 token key
 * 返回 null 表示该 runner 不需要检查 token
 */
function getTokenKeyForRunner(runner: Runner): 'official' | 'kimi' | 'glm' | 'minmax' | null {
  switch (runner) {
    case 'claude-code-glm':
      return 'glm'
    case 'claude-code-kimi':
    case 'kimi-cli':
      return 'kimi'
    case 'claude-code-minimax':
      return 'minmax'
    case 'claude-code':
      return 'official'
    case 'codex':
      // Codex 使用环境变量 OPENAI_API_KEY，不在应用内配置
      return null
    default:
      return null
  }
}

/** 获取 runner 对应的设置页面路由参数 */
function getSettingsRouteForRunner(runner: Runner): string {
  switch (runner) {
    case 'claude-code-glm':
      return '/settings?agents=glm'
    case 'claude-code-kimi':
    case 'kimi-cli':
      return '/settings?agents=kimi'
    case 'claude-code-minimax':
      return '/settings?agents=minmax'
    case 'claude-code':
      return '/settings?agents=claude'
    case 'codex':
      return '/settings?agents=codex'
    default:
      return '/settings'
  }
}

interface SessionsViewProps {
  project: ProjectInfo
}

/**
 * SessionsView - 会话列表与聊天视图
 * 从原 WorkspacePage 抽取的核心聊天功能
 */
export default function SessionsView({ project }: SessionsViewProps) {
  const navigate = useNavigate()
  const { removeProject } = useProjects()

  const projectId = project.id
  const chat = useProjectChat(projectId)
  const { selectedDocPath, setSelectedDocPath, previewTocOpen, setPreviewTocOpen } =
    useProjectPreview(projectId)

  // ensure project state exists (sessions will be loaded from backend via useProjectChat hook)
  useEffect(() => {
    if (!projectId) return
    chat.ensure(projectId)
  }, [projectId, chat])

  const sessions = chat.sessions
  const loaded = chat.loaded
  const activeSessionId = chat.activeSessionId ?? sessions[0]?.id ?? null

  // 如果没有任何 session，自动创建一个
  // 重要：必须等待后端数据加载完成后再判断，避免竞态条件
  useEffect(() => {
    if (loaded && sessions.length === 0 && projectId) {
      const defaultSession: Session = {
        id: `session-${Date.now()}`,
        title: 'New Session',
        messages: [
          {
            id: 'welcome',
            role: 'assistant',
            content: 'You can ask questions about this project, its docs, or files.'
          }
        ]
      }
      void chat.addSession(defaultSession)
    }
  }, [loaded, sessions.length, projectId, chat])
  const [input, setInput] = useState('')
  /** 底层 Runner（执行器） */
  const [runner, setRunner] = useState<NonNullable<RunnerRunOptions['runner']>>('claude-code-glm')
  /** Agent ID（角色） */
  const [agentId, setAgentId] = useState('general')
  const [runningTraceId, setRunningTraceId] = useState<string | null>(null)

  const {
    html: previewHtml,
    rendering: previewRendering,
    toc: previewToc,
    previewRef,
    onDocChange: handlePreviewDocChange,
    onTocClick: handlePreviewTocClick
  } = usePreviewDocument({
    onDocPathChange: (path) => setSelectedDocPath(path)
  })

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0],
    [sessions, activeSessionId]
  )
  const messages = activeSession?.messages ?? []

  const { run, subscribe, cancel } = useAgentRunner()
  const { play: playSfx } = useSfx()

  // 获取 tokens 用于检查 API key 是否已配置
  const tokensQuery = useClaudeTokensQuery()
  const tokens = tokensQuery.data ?? {}

  const handleSend = async () => {
    if (runningTraceId || !project) return
    const value = input.trim()
    if (!value) return
    const targetSessionId = activeSession?.id ?? sessions[0]?.id
    if (!targetSessionId) return

    // 检查当前 runner 是否需要 API key，如果需要且未配置则提示
    const tokenKey = getTokenKeyForRunner(runner)
    if (tokenKey && !tokens[tokenKey]) {
      const settingsRoute = getSettingsRouteForRunner(runner)
      toast.error(`请先配置 API Key`, {
        description: `当前选择的 ${runner} 需要配置 API Key 才能使用`,
        action: {
          label: '去设置',
          onClick: () => navigate(settingsRoute)
        }
      })
      return
    }

    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', content: value }
    const traceId =
      typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `codex-${Date.now()}`
    const assistantMsg: Message = {
      id: `assistant-${traceId}`,
      role: 'assistant',
      content: '',
      traceId,
      status: 'running',
      logs: [],
      output: '',
      startedAt: Date.now(),
      runner // 记录使用的 runner
    }

    await chat.appendMessages(targetSessionId, [userMsg, assistantMsg])
    // 会话开始：播放开始音效（若启用）
    playAudioFx('start')
    setInput('')

    if (!run) return

    // 获取 Agent 配置，注入 System Prompt
    const agent = getPresetAgent(agentId)
    const finalPrompt = agent ? buildAgentPrompt(agent, value) : value

    // 根据当前选择的 runner 获取对应的 contextId，用于上下文续写
    const runnerContextId = activeSession?.runnerContexts?.[runner]
    setRunningTraceId(traceId)
    run({
      runner,
      projectId: project.id,
      prompt: finalPrompt,
      traceId,
      contextId: runnerContextId
    }).catch(() => {
      setRunningTraceId(null)
      // On error, a subsequent Codex 'error' event will update the assistant message via store
    })
  }

  const handleNewSession = async () => {
    const newSession: Session = {
      id: `session-${Date.now()}`,
      title: `Session ${sessions.length + 1}`,
      messages: []
    }
    await chat.addSession(newSession)
  }

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    await chat.updateSessionTitle(sessionId, newTitle)
  }

  const handleArchiveSession = async (sessionId: string, archived: boolean) => {
    await chat.archiveSession(sessionId, archived)
  }

  const handleDeleteSession = async (sessionId: string) => {
    await chat.removeSession(sessionId)
  }

  const handleInterrupt = () => {
    if (!runningTraceId || !cancel) return
    void cancel(runningTraceId)
  }

  const handleRemoveProject = async () => {
    if (!project) return
    const ok = window.confirm(
      `确定要从列表中移除 ${project.name || project.repoPath} 吗？文件仍保留在磁盘上。`
    )
    if (!ok) return
    await removeProject(project.id)
    navigate('/')
  }

  // Subscribe to Codex events
  useEffect(() => {
    const queueRef = { current: [] as RunnerEvent[] }
    // 记录需要同步的消息 (traceId -> sessionId)
    const pendingSync = { current: new Map<string, string>() }
    let scheduled = false
    const flush = () => {
      scheduled = false
      const batch = queueRef.current
      if (batch.length === 0) return
      chat.applyRunnerEventsBatch(batch)
      queueRef.current = []

      // 同步已完成的消息到后端
      for (const [traceId, sessionId] of pendingSync.current) {
        const messageId = `assistant-${traceId}`
        // immediate=true 立即同步，因为任务已完成
        chat.syncMessageToBackend(sessionId, messageId, true)
      }
      pendingSync.current.clear()
    }
    const unsubscribe = subscribe((event: RunnerEvent) => {
      if (event.type === 'exit') {
        const ok = (event.code ?? 1) === 0
        const ms = typeof event.durationMs === 'number' ? `${event.durationMs}ms` : ''
        if (ok) {
          toast.success(`执行完成 ${ms}`)
          // 通知完成：播放 notify 提醒音
          playSfx('notify')
        } else {
          toast.error(`执行失败 (exit ${event.code ?? '?'}) ${ms}`)
        }
        // 会话结束：播放结束音效（若启用）
        playAudioFx('end')
        setRunningTraceId(null)
        // 标记需要同步到后端
        if (activeSessionId) {
          pendingSync.current.set(event.traceId, activeSessionId)
        }
      } else if (event.type === 'error') {
        toast.error(event.message || '执行出错')
        setRunningTraceId(null)
        // 错误时也需要同步
        if (activeSessionId) {
          pendingSync.current.set(event.traceId, activeSessionId)
        }
      }
      queueRef.current.push(event)
      if (!scheduled) {
        scheduled = true
        queueMicrotask(flush)
      }
    })
    return () => {
      unsubscribe()
      // 清空未处理事件，避免内存泄漏
      queueRef.current = []
      pendingSync.current.clear()
    }
  }, [subscribe, activeSessionId, chat])

  return (
    <WorkspaceLayout
      project={project}
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={(id) => chat.setActiveSessionId(id)}
      onNewSession={handleNewSession}
      onRenameSession={handleRenameSession}
      onArchiveSession={handleArchiveSession}
      onDeleteSession={handleDeleteSession}
      messages={messages}
      input={input}
      onInputChange={setInput}
      onSend={handleSend}
      isRunning={!!runningTraceId}
      onInterrupt={handleInterrupt}
      runner={runner}
      onRunnerChange={setRunner}
      agentId={agentId}
      onAgentIdChange={setAgentId}
      onDocChange={handlePreviewDocChange}
      previewDocPath={selectedDocPath}
      previewHtml={previewHtml}
      previewRendering={previewRendering}
      previewRef={previewRef}
      previewToc={previewToc}
      onTocClick={handlePreviewTocClick}
      previewTocOpen={previewTocOpen}
      onTogglePreviewToc={setPreviewTocOpen}
      onRemoveProject={handleRemoveProject}
    />
  )
}
