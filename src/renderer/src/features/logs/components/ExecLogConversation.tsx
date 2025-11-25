import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, FileDiff, MessageSquare, Puzzle, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseConversationLog, type LogEvent } from '@/lib/conversationLog'
import { useAutoScrollBottom } from '@/shared/hooks/useAutoScroll'

interface ExecLogEntry {
  id: string
  stream: 'stdout' | 'stderr'
  text: string
}

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

function EventItem({ ev }: { ev: LogEvent }) {
  switch (ev.type) {
    case 'session_start':
      return (
        <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3 w-3" />
          <span>Session</span>
          {ev.meta.model && <Badge className="bg-accent/40">{ev.meta.model}</Badge>}
          {ev.meta.sessionId && <span className="truncate">{ev.meta.sessionId}</span>}
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

export default function ExecLogConversation({ logs }: { logs: ExecLogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)

  // Join logs stream into a single text in arrival order
  const joined = useMemo(() => {
    if (!Array.isArray(logs) || logs.length === 0) return ''
    let out = ''
    for (const entry of logs) {
      const chunk = String(entry.text ?? '')
      // Ensure line break boundaries when chunks are partial lines
      if (out && !out.endsWith('\n') && !chunk.startsWith('\n')) out += '\n'
      out += chunk
    }
    return out
  }, [logs])

  const sessions = useMemo(() => {
    try {
      return parseConversationLog(joined || '')
    } catch {
      return []
    }
  }, [joined])

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

  useAutoScrollBottom(scrollRef, stickToBottom, [sessions.length, stickToBottom])

  return (
    <div ref={scrollRef} className="max-h-64 overflow-auto">
      {sessions.map((s, idx) => (
        <div key={idx} className="mb-3">
          <div className="mb-0.5 text-[11px] text-muted-foreground">
            Session {idx + 1} — {s.meta.model || 'model'}
          </div>
          {(s.meta.workdir ||
            s.meta.provider ||
            s.meta.approval ||
            s.meta.sandbox ||
            s.meta.reasoningEffort) && (
            <div className="mb-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
              {s.meta.workdir && (
                <span>
                  workdir: <span className="font-mono">{s.meta.workdir}</span>
                </span>
              )}
              {s.meta.provider && <span>provider: {s.meta.provider}</span>}
              {s.meta.approval && <span>approval: {s.meta.approval}</span>}
              {s.meta.sandbox && <span>sandbox: {s.meta.sandbox}</span>}
              {s.meta.reasoningEffort && <span>reasoning: {s.meta.reasoningEffort}</span>}
            </div>
          )}
          {s.events.map((ev, i) => (
            <EventItem key={`${s.meta.sessionId ?? idx}-${i}`} ev={ev} />
          ))}
        </div>
      ))}
      {sessions.length === 0 && (
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground">
            No parsed conversation events. Showing raw logs:
          </div>
          {logs.map((entry) => (
            <pre
              key={entry.id}
              className={cn(
                'whitespace-pre-wrap rounded-md bg-background/80 px-2 py-1 text-[11px] font-mono',
                entry.stream === 'stderr' ? 'text-red-300' : 'text-foreground'
              )}
            >
              <span className="mr-2 opacity-70">[{entry.stream}]</span>
              {entry.text}
            </pre>
          ))}
        </div>
      )}
    </div>
  )
}
