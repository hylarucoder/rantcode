import { useState } from 'react'
import { MessageSquare, Bot, Plus, Check, FileText, Code, TestTube, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Session } from '@/features/workspace/types'
import { PRESET_AGENTS, type AgentConfig } from '@shared/agents'

type TabType = 'sessions' | 'assistants'

interface SessionsAssistantsPanelProps {
  // Sessions
  sessions: Session[]
  activeSessionId?: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  // Assistants
  agentId: string
  onAgentIdChange: (id: string) => void
}

/** 根据 Agent ID 返回对应图标 */
function getAgentIcon(id: string, className?: string) {
  const cls = className ?? 'h-4 w-4'
  switch (id) {
    case 'analyst':
      return <FileText className={cls} />
    case 'architect':
      return <Compass className={cls} />
    case 'developer':
      return <Code className={cls} />
    case 'tester':
      return <TestTube className={cls} />
    default:
      return <Bot className={cls} />
  }
}

function SessionItem({
  session,
  isActive,
  onClick
}: {
  session: Session
  isActive: boolean
  onClick: () => void
}) {
  const last = session.messages[session.messages.length - 1]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full cursor-pointer rounded-lg px-3 py-2 text-left transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'bg-transparent text-foreground hover:bg-accent/50'
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={cn('text-sm font-medium', isActive && 'text-primary')}>
          {session.title}
        </span>
        {last && (
          <span className="block max-w-full truncate text-xs text-muted-foreground/70">
            {last.content}
          </span>
        )}
      </div>
    </button>
  )
}

function AgentItem({
  agent,
  isActive,
  onClick
}: {
  agent: AgentConfig
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      <span className={cn('mt-0.5', isActive ? 'text-primary' : 'text-muted-foreground/70')}>
        {getAgentIcon(agent.id)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-medium', isActive && 'text-primary')}>
            {agent.name}
          </span>
          {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
        </div>
        {agent.description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground/70">{agent.description}</p>
        )}
      </div>
    </button>
  )
}

export function SessionsAssistantsPanel({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  agentId,
  onAgentIdChange
}: SessionsAssistantsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('sessions')
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0]

  return (
    <div className="flex h-full flex-col">
      {/* Tab 切换 */}
      <div className="flex shrink-0 border-b border-border/50">
        <button
          type="button"
          onClick={() => setActiveTab('sessions')}
          className={cn(
            'relative flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors',
            activeTab === 'sessions'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {activeTab === 'sessions' && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
          )}
          <MessageSquare className="h-3.5 w-3.5" />
          会话
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('assistants')}
          className={cn(
            'relative flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors',
            activeTab === 'assistants'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {activeTab === 'assistants' && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
          )}
          <Bot className="h-3.5 w-3.5" />
          助手
        </button>
      </div>

      {/* 内容区域 */}
      {activeTab === 'sessions' ? (
        /* 会话列表 */
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {sessions.length} 个会话
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={onNewSession}
            >
              <Plus className="h-3 w-3" />
              新建
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            <div className="flex flex-col gap-1">
              {sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSession?.id}
                  onClick={() => onSelectSession(session.id)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* 助手列表 */
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-2">
            <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              预设角色
            </div>
            <div className="flex flex-col gap-1">
              {PRESET_AGENTS.map((agent) => (
                <AgentItem
                  key={agent.id}
                  agent={agent}
                  isActive={agentId === agent.id}
                  onClick={() => onAgentIdChange(agent.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

