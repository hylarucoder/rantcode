import { act, renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { usePreviewDocument } from './usePreviewDocument'
import type { SpecDocMeta } from '@/types'

vi.mock('@/hooks/use-theme-mode', () => ({
  useThemeMode: () => 'light'
}))

const renderMarkdownToHtml = vi.fn(async (...args: unknown[]) => {
  void args
  return '<h1>Title</h1>'
})

vi.mock('@/lib/markdown', () => ({
  renderMarkdownToHtml: (markdown: string, mode?: string) => renderMarkdownToHtml(markdown, mode)
}))

describe('usePreviewDocument', () => {
  beforeEach(() => {
    renderMarkdownToHtml.mockClear()
  })

  it('renders markdown and notifies path change when doc updates', async () => {
    const onDocPathChange = vi.fn()
    const { result } = renderHook(() => usePreviewDocument({ onDocPathChange }))
    const doc: SpecDocMeta = { path: 'docs/demo.md', content: '# Title' }

    await act(async () => {
      result.current.onDocChange(doc)
    })

    expect(onDocPathChange).toHaveBeenCalledWith('docs/demo.md')
    await waitFor(() => {
      expect(result.current.html).toContain('<h1>')
      expect(result.current.rendering).toBe(false)
    })
    expect(renderMarkdownToHtml).toHaveBeenCalledWith('# Title', 'light')
  })

  it('setDoc can skip notifying path changes', async () => {
    const onDocPathChange = vi.fn()
    const { result } = renderHook(() => usePreviewDocument({ onDocPathChange }))
    const doc: SpecDocMeta = { path: 'docs/demo.md', content: '# Title' }

    await act(async () => {
      result.current.setDoc(doc, { notifyPath: false })
    })

    expect(onDocPathChange).not.toHaveBeenCalled()
  })

  it('scrolls heading when onTocClick is triggered', () => {
    const { result } = renderHook(() => usePreviewDocument())
    const heading = document.createElement('h1')
    const scrollSpy = vi.fn()
    heading.scrollIntoView = scrollSpy
    const container = document.createElement('div')
    container.appendChild(heading)

    act(() => {
      result.current.previewRef.current = container
    })

    result.current.onTocClick(0)
    expect(scrollSpy).toHaveBeenCalled()
  })
})
