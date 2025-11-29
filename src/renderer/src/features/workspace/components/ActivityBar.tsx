import { MessageSquare, FileText, Settings, GitBranch, KanbanSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ActivityView = 'sessions' | 'kanban' | 'docs' | 'git' | 'settings'

interface ActivityBarProps {
  activeView: ActivityView
  onViewChange: (view: ActivityView) => void
}

const activities: { id: ActivityView; icon: typeof MessageSquare; label: string }[] = [
  { id: 'sessions', icon: MessageSquare, label: '会话 / 助手' },
  { id: 'kanban', icon: KanbanSquare, label: '看板' },
  { id: 'docs', icon: FileText, label: '文档' },
  { id: 'git', icon: GitBranch, label: 'Git' },
  { id: 'settings', icon: Settings, label: '设置' }
]

export function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  return (
    <div className="flex h-full w-12 flex-col items-center border-r border-border/50 bg-muted/30 py-2">
      {activities.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onViewChange(id)}
          className={cn(
            'group relative flex h-11 w-11 items-center justify-center rounded-lg transition-all duration-150',
            'hover:bg-accent/60',
            activeView === id
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title={label}
        >
          {/* Active indicator */}
          {activeView === id && (
            <span className="absolute left-0 h-6 w-0.5 rounded-r-full bg-primary" />
          )}
          <Icon className="h-5 w-5" />
          {/* Tooltip */}
          <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            {label}
          </span>
        </button>
      ))}
    </div>
  )
}
