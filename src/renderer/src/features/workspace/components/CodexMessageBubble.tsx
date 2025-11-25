import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useThemeMode } from '@/hooks/use-theme-mode'
import { renderMarkdownToHtml } from '@/lib/markdown'
import { ExecLogConversation } from '@/features/logs'
import { useAutoScrollBottom } from '@/shared/hooks/useAutoScroll'
import type { ChatMessage } from '@/features/workspace/types'

export function CodexMessageBubble({ msg }: { msg: ChatMessage }) {
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null)
  const themeMode = useThemeMode()
  const [logTab, setLogTab] = useState<'exec' | 'conversation'>('exec')
  const hasLogs = (msg.logs?.length ?? 0) > 0
  const execScrollRef = useRef<HTMLDivElement | null>(null)
  const trimmedOutput = (msg.output ?? '').trim()
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(() => {
    if (!msg.startedAt) return null
    const diff = Math.floor((Date.now() - msg.startedAt) / 1000)
    return diff >= 0 ? diff : 0
  })

  useEffect(() => {
    if (!trimmedOutput) {
      return
    }
    let cancelled = false
    renderMarkdownToHtml(trimmedOutput, themeMode)
      .then((html) => {
        if (!cancelled) setRenderedHtml(html)
      })
      .catch(() => {
        if (!cancelled) setRenderedHtml(null)
      })
    return () => {
      cancelled = true
    }
  }, [trimmedOutput, themeMode])

  useEffect(() => {
    if (!msg.startedAt) {
      setElapsedSeconds(null)
      return
    }

    const compute = () => {
      const diff = Math.floor((Date.now() - msg.startedAt!) / 1000)
      setElapsedSeconds(diff >= 0 ? diff : 0)
    }

    compute()

    if (msg.status !== 'running') {
      return
    }

    const id = window.setInterval(compute, 1000)
    return () => window.clearInterval(id)
  }, [msg.status, msg.startedAt])

  useAutoScrollBottom(execScrollRef, logTab === 'exec', [msg.logs?.length, logTab])

  const displayHtml = trimmedOutput ? renderedHtml : null

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-xl border border-border/70 bg-card px-3 py-1.5 text-sm text-card-foreground">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Codex
          {msg.sessionId && (
            <span className="ml-1 font-mono text-[10px] opacity-70">
              ({msg.sessionId.slice(0, 8)})
            </span>
          )}
          {msg.status === 'running' && (
            <span className="ml-2 text-[11px] font-normal">
              执行中…
              {typeof elapsedSeconds === 'number' && (
                <span className="ml-1 opacity-80">（{elapsedSeconds}s）</span>
              )}
            </span>
          )}
          {msg.status === 'success' && (
            <span className="ml-2 text-[11px] font-normal text-emerald-400">完成</span>
          )}
          {msg.status === 'error' && (
            <span className="ml-2 text-[11px] font-normal text-red-400">失败</span>
          )}
        </div>
        <div className="mt-1.5 border-t border-border/50 pt-1.5">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
            <span>日志</span>
            <div className="ml-2 inline-flex gap-1">
              <button
                type="button"
                onClick={() => setLogTab('exec')}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[11px]',
                  logTab === 'exec'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/40'
                )}
              >
                执行日志
              </button>
              <button
                type="button"
                onClick={() => setLogTab('conversation')}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[11px]',
                  logTab === 'conversation'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/40'
                )}
              >
                会话日志
              </button>
            </div>
          </div>
          {logTab === 'exec' ? (
            <div
              ref={execScrollRef}
              className="max-h-64 space-y-1 overflow-auto text-[11px] font-mono"
            >
              {hasLogs ? (
                msg.logs?.map((log) => (
                  <pre
                    key={log.id}
                    className={cn(
                      'whitespace-pre-wrap rounded-md bg-background/80 px-2 py-1',
                      log.stream === 'stderr' ? 'text-red-300' : 'text-foreground'
                    )}
                  >
                    <span className="mr-2 opacity-70">[{log.stream}]</span>
                    {log.text}
                  </pre>
                ))
              ) : (
                <span className="text-[11px] text-muted-foreground">No exec logs.</span>
              )}
            </div>
          ) : (
            <ExecLogConversation logs={msg.logs ?? []} />
          )}
        </div>
        {displayHtml && (
          <div className="markdown-body mt-2 max-h-96 overflow-auto text-xs">
            <div dangerouslySetInnerHTML={{ __html: displayHtml }} />
          </div>
        )}
        {!displayHtml && trimmedOutput && (
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs font-mono">
            {trimmedOutput}
          </pre>
        )}
        {msg.errorMessage && <p className="mt-2 text-xs text-red-400">{msg.errorMessage}</p>}
      </div>
    </div>
  )
}
