import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, FileDiff, MessageSquare, Puzzle, Terminal } from 'lucide-react'
import { useProject } from '@/app/providers'
import { fetchFile } from '@/features/spec'
import { parseAgentTrace, type TraceSession, type TraceEvent } from '@/lib/logParsers'
import { cn } from '@/lib/utils'
import { useAutoScrollBottom } from '@/shared/hooks/useAutoScroll'

function CollapsibleText({ text, lines = 50 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false)
  const content = useMemo(() => text ?? '', [text])
  const showToggle = useMemo(
    () => (content ? content.split('\n').length > lines : false),
    [content, lines]
  )
  if (!content) return null
  const shown = open ? content : content.split('\n').slice(0, lines).join('\n')
  return (
    <div className="whitespace-pre-wrap font-mono text-[12px] leading-snug">
      <div>{shown}</div>
      {showToggle && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-[11px] text-primary hover:underline"
        >
          {open ? '收起' : '展开更多'}
        </button>
      )}
    </div>
  )
}

function Badge({ children, className = '' }: { children: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded px-1 py-0.5 text-[10px]', className)}>
      {children}
    </span>
  )
}

function TraceEventItem({ ev }: { ev: TraceEvent }) {
  switch (ev.type) {
    case 'session_start':
      return (
        <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3 w-3" />
          <span>Session</span>
          {ev.meta.model && <Badge className="bg-accent/40">{ev.meta.model}</Badge>}
          {ev.meta.contextId && <span className="truncate">{ev.meta.contextId}</span>}
        </div>
      )
    case 'user':
      return (
        <div className="mb-1 rounded-md border border-border/60 bg-muted/20 p-1.5">
          <div className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            <span>User</span>
          </div>
          <div className="whitespace-pre-wrap text-[12px] leading-relaxed">{ev.text}</div>
        </div>
      )
    case 'assistant':
      return (
        <div className="mb-1 rounded-md border border-border/60 bg-background p-1.5">
          <div className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            <span>Assistant</span>
          </div>
          <div className="whitespace-pre-wrap text-[12px] leading-relaxed">{ev.text}</div>
        </div>
      )
    case 'note':
      return (
        <div className="mb-1 rounded-md border border-yellow-500/40 bg-yellow-50/10 p-1.5">
          <div className="mb-0.5 text-[11px] text-yellow-700/80">Note ({ev.channel})</div>
          <CollapsibleText text={ev.text} lines={18} />
        </div>
      )
    case 'exec_call':
      return (
        <div className="mb-1 rounded-md border border-border/60 bg-muted/10 p-1.5">
          <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Terminal className="h-3 w-3" />
            <span>exec</span>
            {ev.workdir && <span className="truncate">in {ev.workdir}</span>}
          </div>
          <div className="truncate font-mono text-[11px]">{ev.command}</div>
        </div>
      )
    case 'exec_result':
      return (
        <div
          className={cn(
            'mb-1 rounded-md border p-1.5',
            ev.ok ? 'border-emerald-500/40' : 'border-red-500/40'
          )}
        >
          <div className="mb-0.5 flex items-center gap-1 text-[11px]">
            <Badge className={ev.ok ? 'bg-emerald-500/20' : 'bg-red-500/20'}>
              {ev.ok ? 'OK' : 'FAIL'}
            </Badge>
            {typeof ev.durationMs === 'number' && (
              <span className="text-muted-foreground">{ev.durationMs}ms</span>
            )}
          </div>
          {ev.text && <CollapsibleText text={ev.text} />}
        </div>
      )
    case 'tool_call':
      return (
        <div className="mb-1 rounded-md border border-border/60 bg-muted/10 p-1.5">
          <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Puzzle className="h-3 w-3" />
            <span>tool</span>
            <Badge className="bg-accent/40">{ev.name}</Badge>
          </div>
          {ev.argsText && (
            <div className="whitespace-pre-wrap font-mono text-[12px] leading-snug">
              {ev.argsText}
            </div>
          )}
        </div>
      )
    case 'tool_result':
      return (
        <div
          className={cn(
            'mb-1 rounded-md border p-1.5',
            ev.ok ? 'border-emerald-500/40' : 'border-red-500/40'
          )}
        >
          <div className="mb-0.5 flex items-center gap-1 text-[11px]">
            <Badge className={ev.ok ? 'bg-emerald-500/20' : 'bg-red-500/20'}>
              {ev.ok ? 'OK' : `Exit ${ev.code ?? '?'}`}
            </Badge>
            {typeof ev.durationMs === 'number' && (
              <span className="text-muted-foreground">{ev.durationMs}ms</span>
            )}
          </div>
          {ev.text && <CollapsibleText text={ev.text} />}
        </div>
      )
    case 'patch':
      return (
        <div className="mb-1 rounded-md border border-sky-500/40 p-1.5">
          <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <FileDiff className="h-3 w-3" />
            <span>patch</span>
            <Badge className="bg-sky-500/20">{ev.header}</Badge>
          </div>
          <CollapsibleText text={ev.diff} />
        </div>
      )
    case 'plan_update':
      return (
        <div className="mb-1 rounded-md border border-border/60 bg-muted/10 p-1.5">
          <div className="mb-0.5 text-[11px] text-muted-foreground">Plan update</div>
          <div className="whitespace-pre-wrap font-mono text-[12px] leading-snug">{ev.text}</div>
        </div>
      )
    case 'stats':
      return <div className="mb-1 text-[11px] text-muted-foreground">tokens used: {ev.value}</div>
    case 'truncated':
      return <div className="mb-1 text-[11px] text-muted-foreground">{ev.reason}</div>
    case 'unknown':
      return (
        <div className="mb-1 whitespace-pre-wrap font-mono text-[12px] leading-snug opacity-60">
          {ev.raw}
        </div>
      )
    default:
      return null
  }
}

export default function AgentTracePreview() {
  const { projectId } = useProject()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<TraceSession[]>([])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)

  async function load() {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const file = await fetchFile({ base: 'repo', path: 'conversation.log', projectId })
      const parsed = parseAgentTrace(file.content || '')
      setSessions(parsed)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Failed to load conversation.log')
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [projectId])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const threshold = 48
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
      setStickToBottom(atBottom)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const totalEvents = useMemo(
    () => sessions.reduce((acc, s) => acc + s.events.length, 0),
    [sessions]
  )

  useAutoScrollBottom(scrollRef, !loading && stickToBottom, [totalEvents])

  return (
    <div className="flex h-64 min-h-0 flex-1 flex-col border border-border/60 bg-background/60">
      {error && (
        <div className="border-b border-red-500/30 bg-red-50/20 p-1.5 text-[12px] text-red-700">
          {error}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-auto p-1.5">
        {sessions.map((s, idx) => (
          <div key={idx} className="mb-3">
            <div className="mb-0.5 text-[11px] text-muted-foreground">
              Session {idx + 1} — {s.meta.model || 'model'}
            </div>
            {s.events.map((ev, i) => (
              <TraceEventItem key={`${s.meta.contextId ?? idx}-${i}`} ev={ev} />
            ))}
          </div>
        ))}
        {!loading && sessions.length === 0 && !error && (
          <div className="text-[12px] text-muted-foreground">No events parsed.</div>
        )}
      </div>
    </div>
  )
}
