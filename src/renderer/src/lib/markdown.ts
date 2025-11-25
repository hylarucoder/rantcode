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
