import type { ThemeMode } from '@/types/theme'

interface MermaidAPI {
  initialize(config: {
    startOnLoad?: boolean
    securityLevel?: string
    fontFamily?: string
    theme?: string
  }): void
  render(id: string, chart: string, element?: HTMLElement): Promise<{ svg: string }>
}

function normalizeMermaid(chart: string): string {
  // 在标签括号内将换行替换为 <br/>，避免 Mermaid parser 误判
  const stack: string[] = []
  let out = ''
  for (let i = 0; i < chart.length; i++) {
    const ch = chart[i]
    if (ch === '[' || ch === '(') {
      stack.push(ch)
      out += ch
      continue
    }
    if (ch === ']' && stack[stack.length - 1] === '[') {
      stack.pop()
      out += ch
      continue
    }
    if (ch === ')' && stack[stack.length - 1] === '(') {
      stack.pop()
      out += ch
      continue
    }
    if (ch === '\n' && stack.length > 0) {
      out += '<br/>'
      continue
    }
    out += ch
  }
  return out
}

function collectMermaidBlocks(root: HTMLElement): HTMLDivElement[] {
  const replacements: HTMLDivElement[] = []
  const codeBlocks = root.querySelectorAll('pre > code.language-mermaid') as NodeListOf<HTMLElement>
  codeBlocks.forEach((codeEl) => {
    if ((codeEl as HTMLElement).closest('.mermaid-error')) return
    const pre = codeEl.closest('pre') as HTMLElement | null
    if (!pre) return
    const raw = codeEl.textContent ?? ''
    const container = document.createElement('div')
    container.className = 'mermaid'
    // 保留原始文本内容，交给 mermaid 运行时解析
    container.textContent = raw
    pre.replaceWith(container)
    replacements.push(container)
  })
  return replacements
}

export async function renderMermaidIn(root: HTMLElement, theme: ThemeMode): Promise<void> {
  const containers = collectMermaidBlocks(root)
  if (containers.length === 0) return
  let mermaid: MermaidAPI
  try {
    const mod = await import('mermaid')
    mermaid = mod.default as MermaidAPI
    // 初始化；强制走 inline SVG 渲染（后续我们直接用 render(svg)）
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      fontFamily: 'inherit',
      theme: theme === 'dark' ? 'dark' : 'default'
    })
  } catch (e) {
    // 顶层失败（import/initialize），为所有容器输出错误块
    // eslint-disable-next-line no-console
    console.error('Mermaid bootstrap failed:', e)
    const escapeHtml = (s: string) =>
      s
        .replaceAll(/&/g, '&amp;')
        .replaceAll(/</g, '&lt;')
        .replaceAll(/>/g, '&gt;')
        .replaceAll(/\"/g, '&quot;')
        .replaceAll(/'/g, '&#39;')
    const message = (e instanceof Error ? e.message : String(e)) || 'Unknown error'
    const stack = (e instanceof Error && e.stack ? e.stack : message)
    containers.forEach((el) => {
      const raw = el.textContent ?? ''
      el.innerHTML = `
        <div class=\"mermaid-error\" role=\"alert\">\n          <div><strong>Mermaid 初始化失败：</strong>${escapeHtml(message)}</div>\n          <pre class=\"mermaid-error-msg\">${escapeHtml(stack)}</pre>\n          <pre><code class=\"language-mermaid-source\">${escapeHtml(raw)}</code></pre>\n        </div>
      `
      el.setAttribute('data-mermaid-processed', 'error')
    })
    return
  }
  let seq = 0
  await Promise.all(
    containers.map(async (el) => {
      const id = `mmd-${Date.now()}-${seq++}`
      const chartRaw = el.textContent ?? ''
      const chart = normalizeMermaid(chartRaw)

      const renderOnce = async () => {
        const { svg } = await mermaid.render(id, chart, el)
        el.innerHTML = svg
        el.setAttribute('data-mermaid-processed', '1')
      }

      try {
        await renderOnce()
      } catch (err1) {
        // 首次失败，短暂等待下一帧后重试，避免瞬态错误引起闪烁
        // eslint-disable-next-line no-console
        console.warn('Mermaid first attempt failed, retrying…', err1)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        try {
          await renderOnce()
        } catch (err2) {
          // 仍失败：用 error 包裹并附上源码与错误详情
          // eslint-disable-next-line no-console
          console.error('Mermaid render error (after retry):', err2)
          const escapeHtml = (s: string) =>
            s
              .replaceAll(/&/g, '&amp;')
              .replaceAll(/</g, '&lt;')
              .replaceAll(/>/g, '&gt;')
              .replaceAll(/\"/g, '&quot;')
              .replaceAll(/'/g, '&#39;')
          const message = (err2 instanceof Error ? err2.message : String(err2)) || 'Unknown error'
          const stack = (err2 instanceof Error && err2.stack ? err2.stack : message)
          el.innerHTML = `
            <div class=\"mermaid-error\" role=\"alert\">\n              <div><strong>Mermaid 解析失败：</strong>${escapeHtml(message)}</div>\n              <pre class=\"mermaid-error-msg\">${escapeHtml(stack)}</pre>\n              <pre><code class=\"language-mermaid-source\">${escapeHtml(chartRaw)}</code></pre>\n            </div>
          `
          el.setAttribute('data-mermaid-processed', 'error')
        }
      }
    })
  )
}
