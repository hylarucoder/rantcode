import { Bot, Check, FileText, Code, TestTube, Compass, Cpu } from 'lucide-react'
import { Claude } from '@lobehub/icons'
import { cn } from '@/lib/utils'
import type { RunnerRunOptions } from '@shared/types/webui'
import { PRESET_AGENTS, type AgentConfig } from '@shared/agents'
import { RUNNER_UI_LIST } from '@shared/runners'

interface AssistantPanelProps {
  runner: NonNullable<RunnerRunOptions['runner']>
  onRunnerChange: (runner: NonNullable<RunnerRunOptions['runner']>) => void
  agentId: string
  onAgentIdChange: (id: string) => void
}

/** 根据 Agent ID 返回对应图标 */
function getAgentIcon(id: string) {
  switch (id) {
    case 'analyst':
      return <FileText className="h-4 w-4" />
    case 'architect':
      return <Compass className="h-4 w-4" />
    case 'developer':
      return <Code className="h-4 w-4" />
    case 'tester':
      return <TestTube className="h-4 w-4" />
    default:
      return <Bot className="h-4 w-4" />
  }
}

function AgentListItem({
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
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
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
          <p className="mt-0.5 truncate text-xs text-muted-foreground/80">{agent.description}</p>
        )}
      </div>
    </button>
  )
}

export function AssistantPanel({
  runner,
  onRunnerChange,
  agentId,
  onAgentIdChange
}: AssistantPanelProps) {
  const currentRunner = RUNNER_UI_LIST.find((r) => r.value === runner)

  return (
    <div className="flex h-full flex-col">
      {/* 标题 */}
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60">
          <Claude className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-medium">助手</span>
      </div>

      {/* Agent 列表 */}
      <div className="flex-1 overflow-auto p-2">
        <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          预设角色
        </div>
        <div className="flex flex-col gap-1">
          {PRESET_AGENTS.map((agent) => (
            <AgentListItem
              key={agent.id}
              agent={agent}
              isActive={agentId === agent.id}
              onClick={() => onAgentIdChange(agent.id)}
            />
          ))}
        </div>
      </div>

      {/* 底部：当前 Runner 显示 */}
      <div className="border-t border-border/50 px-4 py-3">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          执行器
        </div>
        <select
          value={runner}
          onChange={(e) => onRunnerChange(e.target.value as typeof runner)}
          className="w-full rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
        >
          {RUNNER_UI_LIST.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <Cpu className="h-3 w-3" />
          使用 {currentRunner?.label} 执行任务
        </p>
      </div>
    </div>
  )
}
