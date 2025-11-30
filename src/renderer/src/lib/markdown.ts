import type { ThemeMode } from '@/types/theme'
import { preloadMarkdownRenderers, renderMarkdown } from './markdownRenderer'

let preloadPromise: Promise<void> | null = null

export function ensureMarkdownPipelinePreloaded(modes?: ThemeMode[]): Promise<void> {
  if (!preloadPromise) {
    const targetModes = modes && modes.length > 0 ? modes : undefined
    preloadPromise = preloadMarkdownRenderers(targetModes)
  }
  return preloadPromise
}

export function renderMarkdownToHtml(markdown: string, mode: ThemeMode = 'light'): Promise<string> {
  return renderMarkdown(markdown, mode)
}

/**
 * 移除 Markdown 文件的 frontmatter（YAML 头部）
 */
export function stripFrontmatter(content?: string): string {
  if (!content) return ''
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i]?.trim() === '---') {
        return lines.slice(i + 1).join('\n')
      }
    }
  }
  return content
}
