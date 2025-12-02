import { useRef, useEffect, useState } from 'react'
import {
  MessageSquare,
  Bot,
  Plus,
  Check,
  FileText,
  Code,
  TestTube,
  Compass,
  MoreHorizontal,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Session } from '@/features/workspace/types'
import { PRESET_AGENTS, type AgentConfig } from '@shared/agents'
import { toast } from 'sonner'

type TabType = 'sessions' | 'assistants'

interface SessionsAssistantsPanelProps {
  // Sessions
  sessions: Session[]
  activeSessionId?: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  // Session 操作
  onRenameSession?: (sessionId: string, newTitle: string) => void
  onArchiveSession?: (sessionId: string, archived: boolean) => void
  onDeleteSession?: (sessionId: string) => void
  // Assistants
  agentId: string
  onAgentIdChange: (id: string) => void
  // 持久化状态（从 store 传入）
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  showArchived: boolean
  onShowArchivedChange: (show: boolean) => void
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
  onClick,
  onRename,
  onArchive,
  onDelete
}: {
  session: Session
  isActive: boolean
  onClick: () => void
  onRename?: (newTitle: string) => void
  onArchive?: (archived: boolean) => void
  onDelete?: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(session.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const last = session.messages[session.messages.length - 1]

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = () => {
    setEditTitle(session.title)
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== session.title) {
      onRename?.(trimmed)
      toast.success('会话已重命名')
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditTitle(session.title)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  const handleArchiveClick = () => {
    onArchive?.(!session.archived)
    toast.success(session.archived ? '会话已取消归档' : '会话已归档')
  }

  const handleDeleteClick = () => {
    onDelete?.()
    toast.success('会话已删除')
  }

  if (isEditing) {
    return (
      <div className="w-full rounded-lg px-3 py-2 bg-accent/50">
        <input
          ref={inputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleSaveEdit}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent text-sm font-medium outline-none border-b border-primary"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group flex w-full items-center gap-1 rounded-lg pr-1 transition-colors',
        isActive ? 'bg-primary/10' : 'bg-transparent hover:bg-accent/50'
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 cursor-pointer px-3 py-2 text-left"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'text-sm font-medium truncate',
                isActive && 'text-primary',
                session.archived && 'text-muted-foreground'
              )}
            >
              {session.title}
            </span>
            {session.archived && <Archive className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
          </div>
          {last && (
            <span className="block max-w-full truncate text-xs text-muted-foreground/70">
              {last.content}
            </span>
          )}
        </div>
      </button>

      {/* 操作菜单 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'h-6 w-6 p-0 shrink-0',
              'opacity-0 group-hover:opacity-100 focus:opacity-100',
              'transition-opacity'
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={handleStartEdit}>
            <Pencil className="h-3.5 w-3.5" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleArchiveClick}>
            {session.archived ? (
              <>
                <ArchiveRestore className="h-3.5 w-3.5" />
                取消归档
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5" />
                归档
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={handleDeleteClick}>
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
  onRenameSession,
  onArchiveSession,
  onDeleteSession,
  agentId,
  onAgentIdChange,
  activeTab,
  onTabChange,
  showArchived,
  onShowArchivedChange
}: SessionsAssistantsPanelProps) {
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0]

  // 过滤会话列表
  const filteredSessions = showArchived ? sessions : sessions.filter((s) => !s.archived)
  const archivedCount = sessions.filter((s) => s.archived).length

  return (
    <div className="flex h-full flex-col">
      {/* Tab 切换 */}
      <div className="flex shrink-0 border-b border-border/50">
        <button
          type="button"
          onClick={() => onTabChange('sessions')}
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
          onClick={() => onTabChange('assistants')}
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
              {filteredSessions.length} 个会话
              {archivedCount > 0 && !showArchived && (
                <span className="ml-1 text-muted-foreground/40">({archivedCount} 已归档)</span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {/* 显示/隐藏已归档 */}
              {archivedCount > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => onShowArchivedChange(!showArchived)}
                  title={showArchived ? '隐藏已归档' : '显示已归档'}
                >
                  {showArchived ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              )}
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
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            <div className="flex flex-col gap-1">
              {filteredSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSession?.id}
                  onClick={() => onSelectSession(session.id)}
                  onRename={
                    onRenameSession
                      ? (newTitle) => onRenameSession(session.id, newTitle)
                      : undefined
                  }
                  onArchive={
                    onArchiveSession
                      ? (archived) => onArchiveSession(session.id, archived)
                      : undefined
                  }
                  onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
                />
              ))}
              {filteredSessions.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground/60">
                  {showArchived ? '没有会话' : '没有活跃会话'}
                </div>
              )}
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
