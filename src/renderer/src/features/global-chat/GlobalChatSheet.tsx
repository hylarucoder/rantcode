import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { MessageSquare, FolderOpen, Plus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { MessageList } from '@/features/workspace/components/MessageList'
import { Composer } from '@/features/workspace/components/Composer'
import { AgentMessageBubble } from '@/features/workspace/components/AgentMessageBubble'
import { UserMessageBubble } from '@/features/workspace/components/UserMessageBubble'
import { AssistantMessageBubble } from '@/features/workspace/components/AssistantMessageBubble'
import type { TimeDisplayMode } from '@/features/workspace/components/MessageTimestamp'
import { useGlobalChatStore } from '@/state/globalChat'
import { useProjects } from '@/state/projects'
import { humanizeDuration } from '@shared/utils/humanize'
import { ProjectProvider } from '@/state/workspace'
import { useProjectChat } from '@/features/workspace/state/store'
import { useAgentRunner } from '@/features/workspace/hooks/useAgentRunner'
import { useSfx } from '@/shared/hooks/useSfx'
import { playAudioFx } from '@/lib/audioFx'
import { toast } from 'sonner'
import { getPresetAgent, buildAgentPrompt } from '@shared/agents'
import { useClaudeTokensQuery } from '@/features/settings/api/agentsHooks'
import type { Message, Session } from '@/features/workspace/types'
import type { RunnerEvent, RunnerRunOptions } from '@shared/types/webui'
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

/**
 * 从消息中提取时间戳
 */
function getMessageTimestamp(msg: Message): number | undefined {
  if (msg.createdAt) return msg.createdAt
  if (msg.startedAt) return msg.startedAt
  const match = msg.id.match(/-(\d{13})$/)
  if (match) return parseInt(match[1], 10)
  return undefined
}

/**
 * GlobalChatSheet - 全局对话面板
 *
 * 从右侧滑出的对话面板，可以在任何页面使用
 * 支持选择项目、管理会话、发送消息
 */
export function GlobalChatSheet() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    isOpen,
    close,
    selectedProjectId,
    setSelectedProjectId,
    referenceFilePath,
    clearReferenceFilePath,
    initialPrompt,
    clearInitialPrompt
  } = useGlobalChatStore()
  const { projects } = useProjects()

  // 当前选中的项目
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  // 如果没有选中项目但有项目列表，自动选择第一个
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id)
    }
  }, [selectedProjectId, projects, setSelectedProjectId])

  // 如果没有项目，显示空状态
  if (!selectedProject) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
        <SheetContent
          side="right"
          className="top-10 flex h-[calc(100%-2.5rem)] w-[420px] flex-col sm:max-w-[420px]"
          showCloseButton
        >
          <SheetHeader className="border-b pb-3">
            <SheetTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('globalChat.title', '对话')}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('globalChat.noProject', '没有可用的项目')}</p>
              <p className="text-xs text-muted-foreground">
                {t('globalChat.addProjectHint', '请先添加一个项目')}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/')}>
              {t('globalChat.goToProjects', '前往项目列表')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="right"
        className="top-10 flex h-[calc(100%-2.5rem)] w-[420px] flex-col p-0 sm:max-w-[420px]"
        showCloseButton={false}
      >
        <ProjectProvider projectId={selectedProject.id}>
          <GlobalChatContent
            project={selectedProject}
            onClose={close}
            referenceFilePath={referenceFilePath}
            onReferenceConsumed={clearReferenceFilePath}
            initialPrompt={initialPrompt}
            onInitialPromptConsumed={clearInitialPrompt}
          />
        </ProjectProvider>
      </SheetContent>
    </Sheet>
  )
}

interface GlobalChatContentProps {
  project: { id: string; name?: string; repoPath: string }
  onClose: () => void
  /** 引用的文件路径，用于预填输入框 */
  referenceFilePath?: string | null
  /** 引用被消费后的回调（用于清除引用） */
  onReferenceConsumed?: () => void
  /** 初始提示词，用于预填完整的提示词内容 */
  initialPrompt?: string | null
  /** 初始提示词被消费后的回调 */
  onInitialPromptConsumed?: () => void
}

function GlobalChatContent({
  project,
  onClose,
  referenceFilePath,
  onReferenceConsumed,
  initialPrompt,
  onInitialPromptConsumed
}: GlobalChatContentProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const chat = useProjectChat(project.id)
  const sessions = chat.sessions
  const loaded = chat.loaded
  const activeSessionId = chat.activeSessionId ?? sessions[0]?.id ?? null

  // 确保项目状态存在
  useEffect(() => {
    if (!project.id) return
    chat.ensure(project.id)
  }, [project.id, chat])

  // 如果没有 session，自动创建一个
  useEffect(() => {
    if (loaded && sessions.length === 0 && project.id) {
      const defaultSession: Session = {
        id: `session-${Date.now()}`,
        title: 'New Session',
        messages: [
          {
            id: 'welcome',
            role: 'assistant',
            content: t('globalChat.welcome', '你可以询问关于这个项目的任何问题。')
          }
        ]
      }
      void chat.addSession(defaultSession)
    }
  }, [loaded, sessions.length, project.id, chat, t])

  const [input, setInput] = useState('')
  const [runner, setRunner] = useState<NonNullable<RunnerRunOptions['runner']>>('claude-code-glm')
  const [agentId] = useState('general')
  const [runningTraceId, setRunningTraceId] = useState<string | null>(null)
  const [timeMode, setTimeMode] = useState<TimeDisplayMode>('relative')

  // 当有引用文件路径时，预填到输入框
  useEffect(() => {
    if (referenceFilePath && loaded) {
      // 格式：@agent-docs/task/xxx.md 关于这个任务...
      const reference = `@agent-docs/${referenceFilePath} `
      setInput(reference)
      // 消费引用，避免重复预填
      onReferenceConsumed?.()
    }
  }, [referenceFilePath, loaded, onReferenceConsumed])

  // 当有初始提示词时，预填到输入框
  useEffect(() => {
    if (initialPrompt && loaded) {
      setInput(initialPrompt)
      // 消费提示词，避免重复预填
      onInitialPromptConsumed?.()
    }
  }, [initialPrompt, loaded, onInitialPromptConsumed])

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

  const tokenKey = getTokenKeyForRunner(runner)
  const runnerConfigured = !tokenKey || !!tokens[tokenKey]

  const handleSend = async () => {
    if (runningTraceId || !project) return
    const value = input.trim()
    if (!value) return
    const targetSessionId = activeSession?.id ?? sessions[0]?.id
    if (!targetSessionId) return

    // 检查当前 runner 是否需要 API key
    const tokenKey = getTokenKeyForRunner(runner)
    if (tokenKey && !tokens[tokenKey]) {
      const settingsRoute = getSettingsRouteForRunner(runner)
      toast.error(t('globalChat.noApiKey', '请先配置 API Key'), {
        description: t('globalChat.noApiKeyDesc', '当前选择的 Runner 需要配置 API Key'),
        action: {
          label: t('globalChat.goToSettings', '去设置'),
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
      runner
    }

    await chat.appendMessages(targetSessionId, [userMsg, assistantMsg])
    playAudioFx('start')
    setInput('')

    if (!run) return

    const agent = getPresetAgent(agentId)
    const finalPrompt = agent ? buildAgentPrompt(agent, value) : value

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

  const handleInterrupt = () => {
    if (!runningTraceId || !cancel) return
    void cancel(runningTraceId)
  }

  // Subscribe to Runner events
  useEffect(() => {
    const queueRef = { current: [] as RunnerEvent[] }
    const pendingSync = { current: new Map<string, string>() }
    let scheduled = false
    const flush = () => {
      scheduled = false
      const batch = queueRef.current
      if (batch.length === 0) return
      chat.applyRunnerEventsBatch(batch)
      queueRef.current = []

      for (const [traceId, sessionId] of pendingSync.current) {
        const messageId = `assistant-${traceId}`
        chat.syncMessageToBackend(sessionId, messageId, true)
      }
      pendingSync.current.clear()
    }
    const unsubscribe = subscribe((event: RunnerEvent) => {
      if (event.type === 'exit') {
        const ok = (event.code ?? 1) === 0
        const timeDisplay =
          typeof event.durationMs === 'number' ? ` ${humanizeDuration(event.durationMs)}` : ''
        if (ok) {
          toast.success(t('globalChat.execDone', '执行完成') + timeDisplay)
          playSfx('notify')
        } else {
          toast.error(
            t('globalChat.execFailed', '执行失败') + ` (exit ${event.code ?? '?'})${timeDisplay}`
          )
        }
        playAudioFx('end')
        setRunningTraceId(null)
        if (activeSessionId) {
          pendingSync.current.set(event.traceId, activeSessionId)
        }
      } else if (event.type === 'error') {
        toast.error(event.message || t('globalChat.execError', '执行出错'))
        setRunningTraceId(null)
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
      queueRef.current = []
      pendingSync.current.clear()
    }
  }, [subscribe, activeSessionId, chat, playSfx, t])

  // 渲染消息气泡
  const renderBubble = useCallback(
    (msg: Message) => {
      const timestamp = getMessageTimestamp(msg)
      const isUser = msg.role === 'user'
      const isAgent = msg.role === 'assistant' && !!msg.traceId
      if (isAgent) {
        return (
          <AgentMessageBubble
            msg={msg}
            projectId={project.id}
            sessionId={activeSessionId ?? ''}
            timestamp={timestamp}
            timeMode={timeMode}
            onTimeModeChange={setTimeMode}
          />
        )
      }
      if (isUser) {
        return (
          <UserMessageBubble
            key={msg.id}
            text={msg.content}
            timestamp={timestamp}
            timeMode={timeMode}
            onTimeModeChange={setTimeMode}
          />
        )
      }
      return (
        <AssistantMessageBubble
          key={msg.id}
          text={msg.content}
          timestamp={timestamp}
          timeMode={timeMode}
          onTimeModeChange={setTimeMode}
        />
      )
    },
    [project.id, activeSessionId, timeMode]
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">{t('globalChat.title', '对话')}</span>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <FolderOpen className="h-3 w-3" />
              <span className="truncate">{project.name || project.repoPath}</span>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <span className="sr-only">Close</span>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </Button>
      </div>

      {/* Session Selector */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Select value={activeSessionId ?? ''} onValueChange={(id) => chat.setActiveSessionId(id)}>
          <SelectTrigger className="h-7 flex-1 text-xs">
            <SelectValue placeholder={t('globalChat.selectSession', '选择会话')} />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleNewSession}
          title={t('globalChat.newSession', '新建会话')}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden px-3 pt-3">
        <MessageList messages={messages} renderMessage={renderBubble} />
      </div>

      {/* Composer */}
      <div className="border-t p-3">
        <Composer
          value={input}
          onChange={setInput}
          onSend={handleSend}
          isRunning={!!runningTraceId}
          onInterrupt={handleInterrupt}
          runner={runner}
          onRunnerChange={setRunner}
          runnerConfigured={runnerConfigured}
        />
      </div>
    </div>
  )
}

export default GlobalChatSheet
