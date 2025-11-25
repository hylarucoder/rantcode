import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize'
import rehypeShiki, { type RehypeShikiOptions } from '@shikijs/rehype'
import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  type LanguageInput
} from 'shiki'
import type { ThemeMode } from '@/types/theme'

type MarkdownProcessor = (markdown: string) => Promise<string>

const PROCESSORS: Partial<Record<ThemeMode, MarkdownProcessor>> = {}

type ThemeName = 'vitesse-light' | 'vitesse-dark'

const THEME_BY_MODE: Record<ThemeMode, ThemeName> = {
  light: 'vitesse-light',
  dark: 'vitesse-dark'
}

const SUPPORTED_LANGS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'bash',
  'shell',
  'markdown',
  'md',
  'yaml',
  'python',
  'go',
  'rust',
  'html',
  'css',
  'scss',
  'java',
  'c',
  'cpp'
] as const

// Rehype/Shiki expect a union type of bundled language IDs; cast once for reuse
const REHYPE_LANGS = SUPPORTED_LANGS as unknown as (BundledLanguage | LanguageInput)[]

let highlighterPromise: Promise<Highlighter> | null = null
// Keep a warm highlighter to prefetch Shiki assets for faster first render.
// Note: rehypeShiki manages its own singleton internally. We do not pass
// the highlighter via options to avoid mismatched types; this is only for warmup.
async function getHighlighterInstance(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: Object.values(THEME_BY_MODE),
      langs: REHYPE_LANGS
    })
  }
  return highlighterPromise
}

async function getProcessor(mode: ThemeMode): Promise<MarkdownProcessor> {
  if (!PROCESSORS[mode]) {
    const themeName = THEME_BY_MODE[mode] ?? 'vitesse-light'
    // Warm load shiki assets in background
    void getHighlighterInstance()
    // Build a sanitize schema that preserves classes/styles for Shiki and safe anchors/images
    type AttrMap = Record<string, string[] | true>
    const ds = defaultSchema as unknown as { tagNames?: string[]; attributes?: AttrMap }
    const sanitizeSchema: SanitizeSchema = {
      ...defaultSchema,
      tagNames: [
        ...(ds.tagNames ?? []),
        'table',
        'thead',
        'tbody',
        'tfoot',
        'tr',
        'th',
        'td',
        'caption',
        'colgroup',
        'col',
        // Allow SVG tags for Mermaid diagrams
        'svg',
        'g',
        'path',
        'rect',
        'circle',
        'ellipse',
        'line',
        'polyline',
        'polygon',
        'text',
        'defs',
        'marker',
        'clipPath',
        'pattern',
        'style',
        'title',
        'desc'
      ],
      attributes: {
        ...(ds.attributes ?? {}),
        a: [...((ds.attributes?.a ?? []) as string[]), 'href', 'rel', 'target'],
        img: [...((ds.attributes?.img ?? []) as string[]), 'src', 'alt'],
        code: [...((ds.attributes?.code ?? []) as string[]), 'className'],
        pre: [...((ds.attributes?.pre ?? []) as string[]), 'className'],
        span: [...((ds.attributes?.span ?? []) as string[]), 'className', 'style'],
        h1: [...((ds.attributes?.h1 ?? []) as string[]), 'id'],
        h2: [...((ds.attributes?.h2 ?? []) as string[]), 'id'],
        h3: [...((ds.attributes?.h3 ?? []) as string[]), 'id'],
        h4: [...((ds.attributes?.h4 ?? []) as string[]), 'id'],
        table: [...(((ds.attributes as AttrMap)?.table ?? []) as string[])],
        thead: [...(((ds.attributes as AttrMap)?.thead ?? []) as string[])],
        tbody: [...(((ds.attributes as AttrMap)?.tbody ?? []) as string[])],
        tfoot: [...(((ds.attributes as AttrMap)?.tfoot ?? []) as string[])],
        tr: [...(((ds.attributes as AttrMap)?.tr ?? []) as string[])],
        th: [
          ...(((ds.attributes as AttrMap)?.th ?? []) as string[]),
          'colspan',
          'rowspan',
          'align'
        ],
        td: [
          ...(((ds.attributes as AttrMap)?.td ?? []) as string[]),
          'colspan',
          'rowspan',
          'align'
        ],
        col: [...(((ds.attributes as AttrMap)?.col ?? []) as string[]), 'span'],
        colgroup: [...(((ds.attributes as AttrMap)?.colgroup ?? []) as string[])],
        // SVG tag attributes for Mermaid output
        svg: [
          ...(((ds.attributes as AttrMap)?.svg ?? []) as string[]),
          'xmlns',
          'viewBox',
          'width',
          'height',
          'preserveAspectRatio',
          'className',
          'style',
          'aria-label',
          'role'
        ],
        g: [
          ...(((ds.attributes as AttrMap)?.g ?? []) as string[]),
          'id',
          'transform',
          'className',
          'style'
        ],
        path: [
          ...(((ds.attributes as AttrMap)?.path ?? []) as string[]),
          'd',
          'transform',
          'className',
          'style',
          'fill',
          'stroke',
          'stroke-width',
          'opacity',
          'marker-start',
          'marker-mid',
          'marker-end'
        ],
        rect: [
          ...(((ds.attributes as AttrMap)?.rect ?? []) as string[]),
          'x',
          'y',
          'width',
          'height',
          'rx',
          'ry',
          'className',
          'style',
          'fill',
          'stroke',
          'stroke-width',
          'opacity'
        ],
        circle: [
          ...(((ds.attributes as AttrMap)?.circle ?? []) as string[]),
          'cx',
          'cy',
          'r',
          'className',
          'style',
          'fill',
          'stroke',
          'stroke-width',
          'opacity'
        ],
        ellipse: [
          ...(((ds.attributes as AttrMap)?.ellipse ?? []) as string[]),
          'cx',
          'cy',
          'rx',
          'ry',
          'className',
          'style',
          'fill',
          'stroke',
          'stroke-width',
          'opacity'
        ],
        line: [
          ...(((ds.attributes as AttrMap)?.line ?? []) as string[]),
          'x1',
          'y1',
          'x2',
          'y2',
          'className',
          'style',
          'stroke',
          'stroke-width',
          'opacity',
          'marker-end',
          'marker-start'
        ],
        polyline: [
          ...(((ds.attributes as AttrMap)?.polyline ?? []) as string[]),
          'points',
          'className',
          'style',
          'fill',
          'stroke',
          'stroke-width',
          'opacity'
        ],
        polygon: [
          ...(((ds.attributes as AttrMap)?.polygon ?? []) as string[]),
          'points',
          'className',
          'style',
          'fill',
          'stroke',
          'stroke-width',
          'opacity'
        ],
        text: [
          ...(((ds.attributes as AttrMap)?.text ?? []) as string[]),
          'x',
          'y',
          'dx',
          'dy',
          'text-anchor',
          'dominant-baseline',
          'font-family',
          'font-size',
          'font-weight',
          'className',
          'style',
          'fill',
          'transform'
        ],
        marker: [
          ...(((ds.attributes as AttrMap)?.marker ?? []) as string[]),
          'id',
          'viewBox',
          'refX',
          'refY',
          'markerWidth',
          'markerHeight',
          'orient',
          'markerUnits',
          'className',
          'style'
        ],
        defs: [...(((ds.attributes as AttrMap)?.defs ?? []) as string[])],
        clipPath: [
          ...(((ds.attributes as AttrMap)?.clipPath ?? []) as string[]),
          'id'
        ],
        pattern: [
          ...(((ds.attributes as AttrMap)?.pattern ?? []) as string[]),
          'id',
          'patternUnits',
          'width',
          'height',
          'x',
          'y'
        ],
        style: [
          ...(((ds.attributes as AttrMap)?.style ?? []) as string[]),
          'type'
        ]
      }
    }
    const base = unified()
      .use(remarkParse)
      .use(remarkGfm)
      // 转到 HAST，允许内联 HTML（后续再 sanitize）
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      // Sanitize raw HTML with a conservative allowlist that still preserves
      // Shiki's inline styles and classes for syntax highlighting.
      .use(rehypeSanitize, sanitizeSchema)
      .use(rehypeShiki as unknown as (this: unknown, ...args: [RehypeShikiOptions]) => void, {
        theme: themeName,
        langs: REHYPE_LANGS
      } satisfies RehypeShikiOptions)
      .use(rehypeStringify)

    PROCESSORS[mode] = async (markdown: string) => {
      const file = await base.process(markdown)
      return String(file)
    }
  }
  return PROCESSORS[mode]!
}

export async function renderMarkdown(markdown: string, mode: ThemeMode = 'light'): Promise<string> {
  const run = await getProcessor(mode)
  return run(markdown)
}

export async function preloadMarkdownRenderers(
  modes: ThemeMode[] = ['light', 'dark']
): Promise<void> {
  await Promise.all(modes.map((mode) => getProcessor(mode)))
}
