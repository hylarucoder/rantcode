import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Session } from '@/features/workspace/types'

export function SessionList({
  sessions,
  activeId,
  onSelect,
  onNew
}: {
  sessions: Session[]
  activeId?: string | null
  onSelect: (id: string) => void
  onNew: () => void
}) {
  const activeSession = sessions.find((s) => s.id === activeId) ?? sessions[0]
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 rounded-none border-0 p-2 shadow-none">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">会话</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-lg px-2 text-xs"
          onClick={onNew}
        >
          新建
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ul className="space-y-1">
          {sessions.map((session) => {
            const isActive = session.id === activeSession?.id
            const last = session.messages[session.messages.length - 1]
            return (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => onSelect(session.id)}
                  className={cn(
                    'w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                    isActive
                      ? 'bg-card text-card-foreground'
                      : 'bg-transparent text-foreground hover:bg-accent/40'
                  )}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-semibold text-card-foreground">
                      {session.title}
                    </span>
                    {last && (
                      <span className="block max-w-[200px] truncate text-xs text-muted-foreground">
                        {last.content}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
