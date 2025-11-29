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
import { cn } from '@/lib/utils'
import {
  parseAgentTrace,
  type TraceEvent,
  type ToolCallData,
  type TodoItem
} from '@/lib/logParsers'
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
        return <CircleCheck className="h-3 w-3 text-emerald-500" />
      case 'in_progress':
        return <CircleDot className="h-3 w-3 text-blue-500" />
      case 'cancelled':
        return <CircleX className="h-3 w-3 text-muted-foreground" />
      default:
        return <Circle className="h-3 w-3 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-1">
      {data.merge !== undefined && (
        <div className="text-[10px] text-muted-foreground">
          merge: {data.merge ? 'true' : 'false'}
        </div>
      )}
      {data.todos.map((todo, i) => (
        <div key={todo.id ?? i} className="flex items-start gap-1.5">
          {statusIcon(todo.status)}
          <span
            className={cn(
              'text-[11px]',
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
        <div className="flex items-center gap-1.5 text-[11px]">
          <FileText className="h-3 w-3 text-muted-foreground" />
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
          <div className="flex items-center gap-1.5 text-[11px]">
            <FileText className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono truncate">{data.filePath}</span>
          </div>
          {data.oldString && (
            <CollapsibleText text={`- ${data.oldString}\n+ ${data.newString ?? ''}`} lines={6} />
          )}
        </div>
      )
    case 'glob':
      return (
        <div className="flex items-center gap-1.5 text-[11px]">
          <Search className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono">{data.pattern}</span>
        </div>
      )
    case 'grep':
      return (
        <div className="flex items-center gap-1.5 text-[11px]">
          <Search className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono">{data.pattern}</span>
          {data.path && <span className="text-muted-foreground">in {data.path}</span>}
        </div>
      )
    case 'bash':
      return (
        <div className="flex items-center gap-1.5 text-[11px]">
          <Terminal className="h-3 w-3 text-muted-foreground" />
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
  const isLong = lines > 8 || argsText.length > 400

  if (!isLong) {
    return (
      <div className="whitespace-pre-wrap font-mono text-[11px] leading-snug opacity-80">
        {argsText}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-primary hover:underline"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {open ? '收起参数' : `展开参数 (${lines} 行)`}
      </button>
      {open && (
        <div className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-snug opacity-80">
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
        <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3 w-3" />
          <span>Session</span>
          {ev.meta.parentSessionId && <Badge className="bg-blue-500/20">resumed</Badge>}
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
              <span className="text-muted-foreground">{humanizeDuration(ev.durationMs)}</span>
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
          {ev.argsText && <CollapsibleToolArgs argsText={ev.argsText} data={ev.data} />}
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
              <span className="text-muted-foreground">{humanizeDuration(ev.durationMs)}</span>
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

export default function ExecAgentTrace({ logs }: { logs: ExecLogEntry[] }) {
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
      return parseAgentTrace(joined || '')
    } catch {
      return []
    }
  }, [joined])

  const totalEvents = useMemo(
    () => sessions.reduce((acc, s) => acc + s.events.length, 0),
    [sessions]
  )

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

  useAutoScrollBottom(scrollRef, stickToBottom, [totalEvents])

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
            <TraceEventItem key={`${s.meta.sessionId ?? idx}-${i}`} ev={ev} />
          ))}
        </div>
      ))}
      {sessions.length === 0 && (
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground">
            No parsed trace events. Showing raw logs:
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
