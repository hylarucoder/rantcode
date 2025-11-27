import { useEffect, useMemo, useState } from 'react'
import type { ProjectInfo } from '@/types'
import { WorkspaceLayout } from '@/features/workspace/views/WorkspaceLayout'
import { WorkspaceProvider } from '@/state/workspace'
import { useCodexRunner } from '@/features/workspace/hooks/useCodexRunner'
import { usePreviewDocument } from '@/features/preview'
import { useWorkspaceChat, useWorkspacePreview } from '@/features/workspace/state/store'
import type { CodexEvent, CodexRunOptions } from '@shared/types/webui'
import { toast } from 'sonner'
import { useSfx } from '@/hooks/useSfx'
import type { ChatMessage, ChatSession } from '@/features/workspace/types'
import { playAudioFx } from '@/lib/audioFx'

/**
 * Temporary workspace view wrapper.
 * Step 1: act as a façade to legacy ProjectDetailShell to enable gradual refactor.
 * Step 2: replace internals with split components (SessionList/MessageList/Composer/RightPanel).
 */
const INITIAL_SESSIONS: ChatSession[] = [
  {
    id: 'default',
    title: 'Getting started',
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: 'You can ask questions about this project, its docs, or files.'
      }
    ]
  }
]

// Codex event application is handled in the workspace store.

interface WorkspacePageProps {
  project: ProjectInfo
  onRemoveProject?: () => void
}

export default function WorkspacePage({ project, onRemoveProject }: WorkspacePageProps) {
  const workspaceId = project.id
  const chat = useWorkspaceChat(workspaceId)
  const { selectedDocPath, setSelectedDocPath, previewTocOpen, setPreviewTocOpen } =
    useWorkspacePreview(workspaceId)
  // ensure initial workspace/chat state
  useEffect(() => {
    chat.ensure(workspaceId, () => ({
      sessions: INITIAL_SESSIONS.slice(),
      activeSessionId: INITIAL_SESSIONS[0]?.id ?? null
    }))
  }, [workspaceId])
  const sessions = chat.sessions
  const activeSessionId = chat.activeSessionId ?? sessions[0]?.id ?? 'default'
  const [input, setInput] = useState('')
  const [agent, setAgent] = useState<NonNullable<CodexRunOptions['agent']>>('claude-code-glm')
  const [runningJobId, setRunningJobId] = useState<string | null>(null)

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

  const { run, subscribe, cancel } = useCodexRunner()
  const { play: playSfx } = useSfx()

  const handleSend = () => {
    if (runningJobId) return
    const value = input.trim()
    if (!value) return
    const targetSessionId = activeSession?.id ?? sessions[0]?.id
    if (!targetSessionId) return

    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: value }
    const jobId =
      typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `codex-${Date.now()}`
    const assistantMsg: ChatMessage = {
      id: `assistant-${jobId}`,
      role: 'assistant',
      content: '',
      jobId,
      status: 'running',
      logs: [],
      output: '',
      startedAt: Date.now(),
      agent
    }

    chat.appendMessages(targetSessionId, [userMsg, assistantMsg])
    // 会话开始：播放开始音效（若启用）
    playAudioFx('start')
    setInput('')

    if (!run) return

    const sessionCodexId = activeSession?.codexSessionId
    setRunningJobId(jobId)
    run({
      agent,
      workspaceId: project.id,
      prompt: value,
      jobId,
      sessionId: sessionCodexId
    }).catch(() => {
      setRunningJobId(null)
      // On error, a subsequent Codex 'error' event will update the assistant message via store
    })
  }

  const handleNewSession = () => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      title: `Session ${sessions.length + 1}`,
      messages: []
    }
    chat.addSession(newSession)
  }

  const handleInterrupt = () => {
    if (!runningJobId || !cancel) return
    void cancel(runningJobId)
  }

  // Subscribe to Codex events
  useEffect(() => {
    const queueRef = { current: [] as CodexEvent[] }
    let scheduled = false
    const flush = () => {
      scheduled = false
      const batch = queueRef.current
      if (batch.length === 0) return
      chat.applyCodexEventsBatch(batch)
      queueRef.current = []
    }
    const unsubscribe = subscribe((event: CodexEvent) => {
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
      } else if (event.type === 'error') {
        toast.error(event.message || '执行出错')
        setRunningJobId(null)
      }
      if (event.type === 'exit') {
        // 会话结束：播放结束音效（若启用）
        playAudioFx('end')
        setRunningJobId(null)
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
    }
  }, [subscribe])

  return (
    <WorkspaceProvider workspaceId={project.id}>
      <WorkspaceLayout
        project={project}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => chat.setActiveSessionId(id)}
        onNewSession={handleNewSession}
        messages={messages}
        input={input}
        onInputChange={setInput}
        onSend={handleSend}
        isRunning={!!runningJobId}
        onInterrupt={handleInterrupt}
        agent={agent}
        onAgentChange={setAgent}
        onDocChange={handlePreviewDocChange}
        previewDocPath={selectedDocPath}
        previewHtml={previewHtml}
        previewRendering={previewRendering}
        previewRef={previewRef}
        previewToc={previewToc}
        onTocClick={handlePreviewTocClick}
        previewTocOpen={previewTocOpen}
        onTogglePreviewToc={setPreviewTocOpen}
        onRemoveProject={onRemoveProject}
      />
    </WorkspaceProvider>
  )
}
