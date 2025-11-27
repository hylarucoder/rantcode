import { useCallback, useEffect, useRef, useState } from 'react'
import { useThemeMode } from '@/hooks/use-theme-mode'
import { renderMarkdownToHtml } from '@/lib/markdown'
import { stripFrontmatter } from '@/spec/utils'
import type { SpecDocMeta } from '@/types'
import type { PreviewTocItem } from './types'

interface UsePreviewDocumentOptions {
  onDocPathChange?: (path: string | null) => void
}

type SetDocInput = SpecDocMeta | null | ((prev: SpecDocMeta | null) => SpecDocMeta | null)

export function usePreviewDocument(options?: UsePreviewDocumentOptions) {
  const { onDocPathChange } = options ?? {}
  const themeMode = useThemeMode()
  const [doc, setDoc] = useState<SpecDocMeta | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [toc, setToc] = useState<PreviewTocItem[]>([])
  const previewRef = useRef<HTMLDivElement | null>(null)

  const setDocValue = useCallback(
    (next: SetDocInput, opts?: { notifyPath?: boolean }) => {
      const resolvedValue = typeof next === 'function' ? next(doc) : next
      const resolved = resolvedValue ?? null
      const notify = opts?.notifyPath ?? true
      if (notify) {
        const prevPath = doc?.path ?? null
        const nextPath = resolved?.path ?? null
        if (prevPath !== nextPath) {
          onDocPathChange?.(nextPath)
        }
      }
      setDoc(resolved)
      if (!resolved?.content) {
        setHtml(null)
        setRendering(false)
        setToc([])
      }
    },
    [doc, onDocPathChange]
  )

  const handleDocChange = useCallback(
    (next: SpecDocMeta | null) => {
      setDocValue(next, { notifyPath: true })
    },
    [setDocValue]
  )

  useEffect(() => {
    if (!doc?.content) {
      return
    }
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setRendering(true)
    })
    renderMarkdownToHtml(stripFrontmatter(doc.content), themeMode)
      .then((rendered) => {
        if (!cancelled) setHtml(rendered)
      })
      .catch(() => {
        if (!cancelled) setHtml(null)
      })
      .finally(() => {
        if (!cancelled) setRendering(false)
      })
    return () => {
      cancelled = true
    }
  }, [doc?.content, themeMode])

  useEffect(() => {
    if (!html || rendering || !previewRef.current) {
      return
    }
    const rootEl = previewRef.current
    const recomputeToc = () => {
      const headings = Array.from(
        rootEl.querySelectorAll('h1, h2, h3') as NodeListOf<HTMLHeadingElement>
      )
      const items: PreviewTocItem[] = headings
        .map((el, index) => ({
          text: (el.textContent || '').trim(),
          level: Number(el.tagName.substring(1)) || 2,
          index
        }))
        .filter((item) => item.text.length > 0)
      setToc(items)
    }
    // Mermaid 渲染交给预览组件自身负责。
    // 这里仅在下一帧统计 heading，避免与 DOM 更新/mermaid 渲染抢顺序。
    const frameId = requestAnimationFrame(() => {
      recomputeToc()
    })
    return () => cancelAnimationFrame(frameId)
  }, [html, rendering, themeMode])

  const handleTocClick = useCallback((index: number) => {
    if (!previewRef.current) return
    const headings = previewRef.current.querySelectorAll(
      'h1, h2, h3'
    ) as NodeListOf<HTMLHeadingElement>
    const target = headings[index]
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return {
    doc,
    html: doc?.content ? html : null,
    rendering: doc?.content ? rendering : false,
    toc: doc?.content ? toc : [],
    previewRef,
    onDocChange: handleDocChange,
    setDoc: setDocValue,
    onTocClick: handleTocClick
  }
}
