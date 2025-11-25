import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, FileDiff, MessageSquare, Puzzle, Terminal } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  parseConversationLog,
  type ConversationSession,
  type LogEvent
} from '@/lib/conversationLog'
import { useCodexLogStore } from '@/state/codexLogs'

function CollapsibleText({ text, lines = 80 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false)
  const content = useMemo(() => text ?? '', [text])
  const showToggle = useMemo(
    () => (content ? content.split('\n').length > lines : false),
    [content, lines]
  )
  if (!content) return null
  const shown = open ? content : content.split('\n').slice(0, lines).join('\n')
  return (
    <div className="whitespace-pre-wrap font-mono text-[12.5px] leading-snug">
      <div>{shown}</div>
      {showToggle && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs text-primary hover:underline"
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function EventBadge({ children, className = '' }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
        className
      )}
    >
      {children}
    </span>
  )
}

function EventItem({ ev }: { ev: LogEvent }) {
  switch (ev.type) {
    case 'session_start':
      return (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          <span>Session</span>
          {ev.meta.model && <EventBadge className="bg-accent/40">{ev.meta.model}</EventBadge>}
          {ev.meta.sessionId && <span className="truncate">id: {ev.meta.sessionId}</span>}
          {ev.meta.workdir && <span className="truncate">in {ev.meta.workdir}</span>}
        </div>
      )
    case 'user':
      return (
        <Card className="mb-2 border-border/70 bg-muted/20 p-2">
          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>User</span>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{ev.text}</div>
        </Card>
      )
    case 'assistant':
      return (
        <Card className="mb-2 border-border/70 bg-background p-2 shadow-sm">
          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Assistant</span>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{ev.text}</div>
        </Card>
      )
    case 'note':
      return (
        <Card className="mb-2 border-dashed border-yellow-500/40 bg-yellow-50/10 p-2">
          <div className="mb-1 text-xs text-yellow-700/80">Note ({ev.channel})</div>
          <CollapsibleText text={ev.text} lines={18} />
        </Card>
      )
    case 'exec_call':
      return (
        <Card className="mb-2 border-border/70 bg-muted/10 p-2">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Terminal className="h-3.5 w-3.5" />
            <span>exec</span>
            {ev.workdir && <span className="truncate">in {ev.workdir}</span>}
          </div>
          <div className="truncate font-mono text-xs">{ev.command}</div>
        </Card>
      )
    case 'exec_result':
      return (
        <Card
          className={cn('mb-2 border p-2', ev.ok ? 'border-emerald-500/40' : 'border-red-500/40')}
        >
          <div className="mb-1 flex items-center gap-2 text-xs">
            <EventBadge className={ev.ok ? 'bg-emerald-500/20' : 'bg-red-500/20'}>
              {ev.ok ? 'OK' : 'FAIL'}
            </EventBadge>
            {typeof ev.durationMs === 'number' && (
              <span className="text-muted-foreground">{ev.durationMs}ms</span>
            )}
          </div>
          {ev.text && <CollapsibleText text={ev.text} />}
        </Card>
      )
    case 'tool_call':
      return (
        <Card className="mb-2 border-border/70 bg-muted/10 p-2">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Puzzle className="h-3.5 w-3.5" />
            <span>tool</span>
            <EventBadge className="bg-accent/40">{ev.name}</EventBadge>
          </div>
          {ev.argsText && (
            <div className="whitespace-pre-wrap font-mono text-[12.5px] leading-snug">
              {ev.argsText}
            </div>
          )}
        </Card>
      )
    case 'tool_result':
      return (
        <Card
          className={cn('mb-2 border p-2', ev.ok ? 'border-emerald-500/40' : 'border-red-500/40')}
        >
          <div className="mb-1 flex items-center gap-2 text-xs">
            <EventBadge className={ev.ok ? 'bg-emerald-500/20' : 'bg-red-500/20'}>
              {ev.ok ? 'OK' : `Exit ${ev.code ?? '?'}`}
            </EventBadge>
            {typeof ev.durationMs === 'number' && (
              <span className="text-muted-foreground">{ev.durationMs}ms</span>
            )}
          </div>
          {ev.text && <CollapsibleText text={ev.text} />}
        </Card>
      )
    case 'patch':
      return (
        <Card className="mb-2 border-sky-500/40 p-2">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <FileDiff className="h-3.5 w-3.5" />
            <span>patch</span>
            <EventBadge className="bg-sky-500/20">{ev.header}</EventBadge>
          </div>
          <CollapsibleText text={ev.diff} />
        </Card>
      )
    case 'plan_update':
      return (
        <Card className="mb-2 border-border/70 bg-muted/10 p-2">
          <div className="mb-1 text-xs text-muted-foreground">Plan update</div>
          <div className="whitespace-pre-wrap font-mono text-[12.5px] leading-snug">{ev.text}</div>
        </Card>
      )
    case 'stats':
      return <div className="mb-2 text-xs text-muted-foreground">tokens used: {ev.value}</div>
    case 'truncated':
      return <div className="mb-2 text-xs text-muted-foreground">{ev.reason}</div>
    case 'unknown':
      return (
        <div className="mb-2 whitespace-pre-wrap font-mono text-[12.5px] leading-snug opacity-60">
          {ev.raw}
        </div>
      )
    default:
      return null
  }
}

export default function ConversationLog() {
  const execLogs = useCodexLogStore((state) => state.entries)
  const clearLogs = useCodexLogStore((state) => state.clear)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)

  const joined = useMemo(() => {
    if (!Array.isArray(execLogs) || execLogs.length === 0) return ''
    let out = ''
    for (const entry of execLogs) {
      const chunk = String(entry.text ?? '')
      if (!chunk) continue
      if (out && !out.endsWith('\n') && !chunk.startsWith('\n')) {
        out += '\n'
      }
      out += chunk
    }
    return out
  }, [execLogs])

  const { sessions, error } = useMemo(() => {
    if (!joined) {
      return { sessions: [] as ConversationSession[], error: null as string | null }
    }
    try {
      const parsed = parseConversationLog(joined)
      return { sessions: parsed, error: null as string | null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        sessions: [] as ConversationSession[],
        error: msg || 'Failed to parse Codex conversation log'
      }
    }
  }, [joined])

  const totalEvents = useMemo(
    () => sessions.reduce((acc, s) => acc + s.events.length, 0),
    [sessions]
  )

  // Track user scroll to decide whether to auto-stick to bottom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const threshold = 64 // px tolerance near bottom
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
      setStickToBottom(atBottom)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // initialize state
    onScroll()
    return () => {
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  // After updates, scroll to bottom for latest output (only if sticking)
  useEffect(() => {
    if (!stickToBottom) return
    const el = scrollRef.current
    if (!el) return
    // defer to next frame to ensure layout is settled
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [sessions, stickToBottom])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <span>Conversation</span>
          <span className="text-xs">{sessions.length} sessions</span>
          <span className="text-xs">{totalEvents} events</span>
        </div>
        <div className="ml-auto inline-flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => clearLogs()}>
            Clear
          </Button>
          <a
            className="text-xs text-primary hover:underline"
            href="#"
            onClick={(e) => {
              e.preventDefault()
              const blob = new Blob([joined], { type: 'text/plain;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'conversation.log'
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            Download raw
          </a>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/40 bg-red-50/30 p-2 text-sm text-red-700">{error}</Card>
      )}

      <div ref={scrollRef} className="relative flex-1 overflow-auto pr-1">
        {sessions.map((s, idx) => (
          <div key={idx} className="mb-6">
            <div className="mb-1 text-xs text-muted-foreground">
              Session {idx + 1} — {s.meta.model || 'model'} — {s.meta.sessionId || 'id'}
            </div>
            {s.events.map((ev, i) => (
              <EventItem key={`${s.meta.sessionId ?? idx}-${i}`} ev={ev} />
            ))}
          </div>
        ))}
        {sessions.length === 0 && !error && (
          <div className="text-sm text-muted-foreground">No events parsed.</div>
        )}

        {/* Jump to latest when user scrolled up */}
        {!stickToBottom && (
          <div className="pointer-events-none sticky bottom-2 flex w-full justify-center">
            <Button
              size="sm"
              variant="secondary"
              className="pointer-events-auto shadow"
              onClick={() => {
                const el = scrollRef.current
                if (!el) return
                el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
                setStickToBottom(true)
              }}
            >
              Jump to latest
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
