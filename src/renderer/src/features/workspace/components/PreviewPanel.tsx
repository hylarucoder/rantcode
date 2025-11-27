import { useEffect, useRef } from 'react'
import { ListTree } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeMode } from '@/hooks/use-theme-mode'
import { renderMermaidIn } from '@/lib/mermaidRuntime'
import type { PreviewTocItem } from '@/features/preview'
import type { ThemeMode } from '@/types/theme'

function PreviewMarkdownContent({
  html,
  previewRef
}: {
  html: string
  previewRef: React.RefObject<HTMLDivElement | null>
}) {
  const themeMode = useThemeMode()
  const renderedRef = useRef<{ html: string; theme: ThemeMode } | null>(null)

  useEffect(() => {
    const container = previewRef.current
    if (!container) return

    // 内容和主题都没变时，不重复写入 DOM，避免覆盖已渲染的 mermaid SVG
    if (renderedRef.current?.html === html && renderedRef.current?.theme === themeMode) {
      return
    }

    container.innerHTML = html
    renderedRef.current = { html, theme: themeMode }

    const frameId = requestAnimationFrame(() => {
      void renderMermaidIn(container, themeMode).catch(() => {})
    })
    return () => cancelAnimationFrame(frameId)
  }, [html, themeMode, previewRef])

  return <div className="markdown-body" ref={previewRef} />
}

export default function PreviewPanel({
  docPath,
  html,
  rendering,
  previewRef,
  toc,
  tocOpen,
  onToggleToc,
  onTocClick
}: {
  docPath?: string | null
  html?: string | null
  rendering?: boolean
  previewRef: React.RefObject<HTMLDivElement | null>
  toc: PreviewTocItem[]
  tocOpen: boolean
  onToggleToc: (next: boolean) => void
  onTocClick: (index: number) => void
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleToc(!tocOpen)}
          disabled={toc.length === 0}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/40 disabled:opacity-60"
        >
          <ListTree className="h-3.5 w-3.5" />
          <span className="sr-only">Toggle table of contents</span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {!docPath && (
          <span className="text-xs text-muted-foreground">请选择左侧文件查看内容。</span>
        )}
        {docPath && html && (
          <>
            <span className="break-all rounded bg-card px-1.5 py-0.5 font-mono text-xs">
              {docPath}
            </span>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {rendering && <p className="text-xs text-muted-foreground">Rendering preview…</p>}
              {!rendering && (
                <PreviewMarkdownContent html={html} previewRef={previewRef} />
              )}
            </div>
          </>
        )}
      </div>
      {tocOpen && toc.length > 0 && (
        <div className="absolute right-3 top-9 z-20 max-h-64 min-w-[180px] max-w-[260px] overflow-y-auto rounded-md border border-border/70 bg-popover px-2 py-2 text-[11px] text-popover-foreground shadow-md">
          <div className="mb-1 font-semibold text-muted-foreground">目录</div>
          <div className="flex flex-col gap-0.5">
            {toc.map((item) => (
              <button
                key={`${item.level}-${item.index}-${item.text}`}
                type="button"
                onClick={() => onTocClick(item.index)}
                className={cn(
                  'w-full rounded px-1.5 py-0.5 text-left hover:bg-accent/30',
                  item.level === 1 ? 'font-semibold' : item.level === 3 ? 'opacity-75' : '',
                  item.level === 2 ? 'pl-3' : item.level === 3 ? 'pl-5' : ''
                )}
              >
                {item.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
