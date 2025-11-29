import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDot,
  CircleX,
  FileDiff,
  FileText,
  MessageSquare,
  Puzzle,
  Search,
  Terminal
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  parseAgentTrace,
  type TraceSession,
  type TraceEvent,
  type ToolCallData,
  type TodoItem
} from '@/lib/logParsers'
import { useRunnerLogStore } from '@/state/runnerLogs'

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

/** 将毫秒转换为人类可读的时间格式 */
function humanizeDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.round((ms % 60_000) / 1000)
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`
}

/** 渲染 TodoWrite 工具的结构化数据 */
function TodoWriteRenderer({ data }: { data: Extract<ToolCallData, { kind: 'todo_write' }> }) {
  const statusIcon = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
      case 'in_progress':
        return <CircleDot className="h-3.5 w-3.5 text-blue-500" />
      case 'cancelled':
        return <CircleX className="h-3.5 w-3.5 text-muted-foreground" />
      default:
        return <Circle className="h-3.5 w-3.5 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-1.5">
      {data.merge !== undefined && (
        <div className="text-[11px] text-muted-foreground">
          merge: {data.merge ? 'true' : 'false'}
        </div>
      )}
      {data.todos.map((todo, i) => (
        <div key={todo.id ?? i} className="flex items-start gap-2">
          {statusIcon(todo.status)}
          <span
            className={cn(
              'text-sm',
              todo.status === 'completed' && 'text-muted-foreground line-through',
              todo.status === 'cancelled' && 'text-muted-foreground line-through'
            )}
          >
            {todo.content}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 渲染文件操作工具的简洁显示 */
function FileOpRenderer({ data }: { data: ToolCallData }) {
  switch (data.kind) {
    case 'read':
      return (
        <div className="flex items-center gap-2 text-sm">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono truncate">{data.filePath}</span>
          {(data.offset || data.limit) && (
            <span className="text-muted-foreground">
              ({data.offset ?? 0}:{data.limit ?? '∞'})
            </span>
          )}
        </div>
      )
    case 'edit':
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono truncate">{data.filePath}</span>
          </div>
          {data.oldString && (
            <CollapsibleText text={`- ${data.oldString}\n+ ${data.newString ?? ''}`} lines={8} />
          )}
        </div>
      )
    case 'glob':
      return (
        <div className="flex items-center gap-2 text-sm">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono">{data.pattern}</span>
        </div>
      )
    case 'grep':
      return (
        <div className="flex items-center gap-2 text-sm">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono">{data.pattern}</span>
          {data.path && <span className="text-muted-foreground">in {data.path}</span>}
        </div>
      )
    case 'bash':
      return (
        <div className="flex items-center gap-2 text-sm">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono truncate">{data.command}</span>
        </div>
      )
    default:
      return null
  }
}

/** 可折叠的工具调用参数 */
function CollapsibleToolArgs({ argsText, data }: { argsText: string; data?: ToolCallData }) {
  const [open, setOpen] = useState(false)

  // 如果有结构化数据，优先使用语义化渲染
  if (data) {
    if (data.kind === 'todo_write') {
      return <TodoWriteRenderer data={data} />
    }
    if (data.kind !== 'generic') {
      return <FileOpRenderer data={data} />
    }
  }

  // 对于 generic 或无结构化数据的情况，显示可折叠的 JSON
  const lines = argsText.split('\n').length
  const isLong = lines > 10 || argsText.length > 500

  if (!isLong) {
    return (
      <div className="whitespace-pre-wrap font-mono text-[12.5px] leading-snug opacity-80">
        {argsText}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {open ? '收起参数' : `展开参数 (${lines} 行)`}
      </button>
      {open && (
        <div className="mt-1 whitespace-pre-wrap font-mono text-[12.5px] leading-snug opacity-80">
          {argsText}
        </div>
      )}
    </div>
  )
}

function TraceEventItem({ ev }: { ev: TraceEvent }) {
  switch (ev.type) {
    case 'session_start':
      return (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          <span>Session</span>
          {ev.meta.parentSessionId && <EventBadge className="bg-blue-500/20">resumed</EventBadge>}
          {ev.meta.model && <EventBadge className="bg-accent/40">{ev.meta.model}</EventBadge>}
          {ev.meta.contextId && <span className="truncate">id: {ev.meta.contextId}</span>}
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
              <span className="text-muted-foreground">{humanizeDuration(ev.durationMs)}</span>
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
          {ev.argsText && <CollapsibleToolArgs argsText={ev.argsText} data={ev.data} />}
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
              <span className="text-muted-foreground">{humanizeDuration(ev.durationMs)}</span>
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

export default function AgentTraceTimeline() {
  const runnerLogs = useRunnerLogStore((state) => state.entries)
  const clearLogs = useRunnerLogStore((state) => state.clear)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)

  const joined = useMemo(() => {
    if (!Array.isArray(runnerLogs) || runnerLogs.length === 0) return ''
    let out = ''
    for (const entry of runnerLogs) {
      const chunk = String(entry.text ?? '')
      if (!chunk) continue
      if (out && !out.endsWith('\n') && !chunk.startsWith('\n')) {
        out += '\n'
      }
      out += chunk
    }
    return out
  }, [runnerLogs])

  const { sessions, error } = useMemo(() => {
    if (!joined) {
      return { sessions: [] as TraceSession[], error: null as string | null }
    }
    try {
      const parsed = parseAgentTrace(joined)
      return { sessions: parsed, error: null as string | null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        sessions: [] as TraceSession[],
        error: msg || 'Failed to parse agent trace'
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
  }, [totalEvents, stickToBottom])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <span>Agent Trace</span>
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
              Session {idx + 1} — {s.meta.model || 'model'} — {s.meta.contextId || 'id'}
            </div>
            {s.events.map((ev, i) => (
              <TraceEventItem key={`${s.meta.contextId ?? idx}-${i}`} ev={ev} />
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
