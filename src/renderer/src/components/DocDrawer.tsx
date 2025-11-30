import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { FileText, X, Loader2, ChevronLeft, ListTree } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fetchFile } from '@/features/spec/api/fs'
import { renderMarkdownToHtml } from '@/lib/markdown'
import { renderMermaidIn } from '@/lib/mermaidRuntime'
import { useThemeMode } from '@/shared/hooks/use-theme-mode'
import { stripFrontmatter } from '@/spec/utils'
import type { ThemeMode } from '@/types/theme'

interface TocItem {
  text: string
  level: number
  index: number
}

export interface DocDrawerProps {
  /** 抽屉是否打开 */
  isOpen: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 初始文档路径 */
  filePath?: string | null
  /** 初始标题（可选，默认从路径提取） */
  title?: string
  /** 项目 ID */
  projectId: string
  /** 文件基础目录，默认 'docs' */
  base?: 'docs' | 'repo'
  /** 抽屉宽度，默认 720px */
  width?: number | string
  /** 从哪边滑入，默认 'left' */
  side?: 'left' | 'right'
  /** 内边距配置，用于避开标题栏等固定元素 */
  inset?: {
    top?: number | string
    bottom?: number | string
  }
}

/**
 * Markdown 内容渲染组件
 * 支持 Mermaid 图表渲染，链接点击处理
 */
function MarkdownContent({
  html,
  onLinkClick
}: {
  html: string
  onLinkClick: (e: React.MouseEvent<HTMLDivElement>) => void
}) {
  const themeMode = useThemeMode()
  const containerRef = useRef<HTMLDivElement>(null)
  const renderedRef = useRef<{ html: string; theme: ThemeMode } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 内容和主题都没变时，不重复写入 DOM，避免覆盖已渲染的 mermaid SVG
    if (renderedRef.current?.html === html && renderedRef.current?.theme === themeMode) {
      return
    }

    container.innerHTML = html
    renderedRef.current = { html, theme: themeMode }

    // 渲染 Mermaid 图表
    const frameId = requestAnimationFrame(() => {
      void renderMermaidIn(container, themeMode).catch(() => {})
    })
    return () => cancelAnimationFrame(frameId)
  }, [html, themeMode])

  return (
    <div
      ref={containerRef}
      className="markdown-body prose prose-sm dark:prose-invert max-w-none [&_a]:text-primary [&_a]:underline [&_a:hover]:text-primary/80"
      onClick={onLinkClick}
    />
  )
}

/**
 * 通用文档预览抽屉组件
 * 支持 Markdown 渲染、Mermaid 图表、TOC 目录、内部链接跳转、外部链接新窗口打开
 */
export function DocDrawer({
  isOpen,
  onClose,
  filePath,
  title,
  projectId,
  base = 'docs',
  width = 720,
  side = 'left',
  inset
}: DocDrawerProps) {
  const [htmlContent, setHtmlContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [currentPath, setCurrentPath] = useState<string>('')
  const [currentTitle, setCurrentTitle] = useState<string>('')
  const [history, setHistory] = useState<{ path: string; title: string }[]>([])
  const [toc, setToc] = useState<TocItem[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const themeMode = useThemeMode()

  // 从路径提取标题
  const extractTitle = (path: string): string => {
    return path.split('/').pop()?.replace(/\.md$/, '').replace(/-/g, ' ') || path
  }

  // 提取 TOC
  const extractToc = useCallback(() => {
    if (!contentRef.current) return
    const headings = Array.from(
      contentRef.current.querySelectorAll('h1, h2, h3') as NodeListOf<HTMLHeadingElement>
    )
    const items: TocItem[] = headings
      .map((el, index) => ({
        text: (el.textContent || '').trim(),
        level: Number(el.tagName.substring(1)) || 2,
        index
      }))
      .filter((item) => item.text.length > 0)
    setToc(items)
  }, [])

  // 加载文档内容的函数
  const loadDocument = useCallback(
    async (docPath: string, docTitle?: string, addToHistory = true) => {
      if (!docPath) return

      setLoading(true)
      setTocOpen(false)

      // 添加到历史记录
      if (addToHistory && currentPath && currentPath !== docPath) {
        setHistory((prev) => [...prev, { path: currentPath, title: currentTitle }])
      }

      setCurrentPath(docPath)
      setCurrentTitle(docTitle || extractTitle(docPath))

      try {
        const { content: fileContent } = await fetchFile({
          base,
          path: docPath,
          projectId
        })

        // 渲染 Markdown（去除 frontmatter）
        const html = await renderMarkdownToHtml(stripFrontmatter(fileContent), themeMode)
        setHtmlContent(html)

        // 延迟提取 TOC，等待 DOM 更新
        requestAnimationFrame(() => {
          extractToc()
        })
      } catch (err) {
        console.error('Failed to load document:', err)
        setHtmlContent('<p class="text-muted-foreground">加载文档失败</p>')
        setToc([])
      } finally {
        setLoading(false)
      }
    },
    [base, projectId, themeMode, currentPath, currentTitle, extractToc]
  )

  // 返回上一个文档
  const goBack = useCallback(() => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    void loadDocument(prev.path, prev.title, false)
  }, [history, loadDocument])

  // TOC 点击跳转
  const handleTocClick = useCallback((index: number) => {
    if (!contentRef.current) return
    const headings = contentRef.current.querySelectorAll('h1, h2, h3') as NodeListOf<HTMLHeadingElement>
    const target = headings[index]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTocOpen(false)
    }
  }, [])

  // 处理链接点击
  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href) return

      // 处理锚点链接（页内跳转）
      if (href.startsWith('#')) {
        e.preventDefault()
        const id = href.slice(1)
        const el = document.getElementById(id)
        el?.scrollIntoView({ behavior: 'smooth' })
        return
      }

      // 处理相对路径的 .md 文件链接
      if (href.endsWith('.md') && !href.startsWith('http://') && !href.startsWith('https://')) {
        e.preventDefault()
        // 解析相对路径
        const basePath = currentPath.split('/').slice(0, -1).join('/')
        const parts = href.split('/')
        const resolvedParts = basePath ? basePath.split('/') : []

        for (const part of parts) {
          if (part === '..') {
            resolvedParts.pop()
          } else if (part !== '.') {
            resolvedParts.push(part)
          }
        }

        const resolvedPath = resolvedParts.join('/')
        void loadDocument(resolvedPath)
        return
      }

      // 外部链接在新窗口打开
      if (href.startsWith('http://') || href.startsWith('https://')) {
        e.preventDefault()
        window.open(href, '_blank', 'noopener,noreferrer')
      }
    },
    [currentPath, loadDocument]
  )

  // 加载初始文档内容
  useEffect(() => {
    if (!isOpen || !filePath) {
      setHtmlContent('')
      setCurrentPath('')
      setCurrentTitle('')
      setHistory([])
      setToc([])
      setTocOpen(false)
      return
    }

    void loadDocument(filePath, title, false)
  }, [isOpen, filePath, title, loadDocument])

  const widthStyle = typeof width === 'number' ? `${width}px` : width
  const isLeft = side === 'left'
  const topOffset = inset?.top ?? 0
  const bottomOffset = inset?.bottom ?? 0
  const topStyle = typeof topOffset === 'number' ? `${topOffset}px` : topOffset
  const bottomStyle = typeof bottomOffset === 'number' ? `${bottomOffset}px` : bottomOffset

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed z-40 bg-black/20 backdrop-blur-sm"
            style={{
              top: topStyle,
              bottom: bottomStyle,
              left: 0,
              right: 0
            }}
            onClick={onClose}
          />

          {/* 抽屉面板 */}
          <motion.div
            initial={{ x: isLeft ? '-100%' : '100%' }}
            animate={{ x: 0 }}
            exit={{ x: isLeft ? '-100%' : '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className={cn(
              'fixed z-50 max-w-[85vw] bg-background border-border shadow-2xl flex flex-col',
              isLeft ? 'left-0 border-r' : 'right-0 border-l'
            )}
            style={{
              width: widthStyle,
              top: topStyle,
              bottom: bottomStyle
            }}
          >
            {/* 抽屉头部 */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                {history.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={goBack}
                    title="返回上一个文档"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate">{currentTitle}</h3>
                  <p className="text-xs text-muted-foreground truncate">{currentPath}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {toc.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setTocOpen((v) => !v)}
                    title="目录"
                  >
                    <ListTree className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* 文档内容 */}
            <div className="relative flex-1 min-h-0">
              <ScrollArea className="h-full">
                <div ref={contentRef} className="p-6">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <MarkdownContent html={htmlContent} onLinkClick={handleContentClick} />
                  )}
                </div>
              </ScrollArea>

              {/* TOC 目录浮层 */}
              <AnimatePresence>
                {tocOpen && toc.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      'absolute top-2 z-20 max-h-[50vh] min-w-[200px] max-w-[300px] overflow-y-auto',
                      'rounded-md border border-border/70 bg-popover px-2 py-2 text-[12px] text-popover-foreground shadow-lg',
                      isLeft ? 'right-3' : 'left-3'
                    )}
                  >
                    <div className="mb-1.5 px-1.5 font-semibold text-muted-foreground">目录</div>
                    <div className="flex flex-col gap-0.5">
                      {toc.map((item) => (
                        <button
                          key={`${item.level}-${item.index}-${item.text}`}
                          type="button"
                          onClick={() => handleTocClick(item.index)}
                          className={cn(
                            'w-full rounded px-1.5 py-1 text-left hover:bg-accent/50 transition-colors',
                            item.level === 1 ? 'font-semibold' : item.level === 3 ? 'opacity-70' : '',
                            item.level === 2 ? 'pl-4' : item.level === 3 ? 'pl-6' : ''
                          )}
                        >
                          {item.text}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default DocDrawer
