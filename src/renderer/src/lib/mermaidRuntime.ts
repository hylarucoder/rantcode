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

let mermaidLightboxRoot: HTMLDivElement | null = null

function ensureMermaidLightboxRoot(): HTMLDivElement {
  if (mermaidLightboxRoot && document.body.contains(mermaidLightboxRoot)) {
    return mermaidLightboxRoot
  }
  const root = document.createElement('div')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.style.position = 'fixed'
  root.style.inset = '0'
  root.style.display = 'none'
  root.style.alignItems = 'center'
  root.style.justifyContent = 'center'
  root.style.backgroundColor = 'rgba(15,23,42,0.8)' // 近似 bg-slate-900/80
  root.style.zIndex = '9999'
  root.addEventListener('click', () => {
    root.style.display = 'none'
    root.innerHTML = ''
  })
  document.body.appendChild(root)
  mermaidLightboxRoot = root
  return root
}

function openMermaidLightbox(svg: string): void {
  if (!svg.trim()) return
  const root = ensureMermaidLightboxRoot()
  root.innerHTML = ''

  const inner = document.createElement('div')
  inner.style.width = '90vw'
  inner.style.maxWidth = '1200px'
  inner.style.maxHeight = '90vh'
  inner.style.backgroundColor = 'rgba(15,23,42,1)' // 近似 bg-slate-900
  inner.style.borderRadius = '0.75rem'
  inner.style.padding = '1rem'
  inner.style.boxShadow = '0 20px 45px rgba(0,0,0,0.45)'
  inner.style.overflow = 'auto'
  inner.style.position = 'relative'
  inner.addEventListener('click', (e) => {
    e.stopPropagation()
  })

  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = '×'
  close.setAttribute('aria-label', 'Close')
  close.style.position = 'absolute'
  close.style.top = '0.25rem'
  close.style.right = '0.5rem'
  close.style.fontSize = '1.25rem'
  close.style.lineHeight = '1'
  close.style.background = 'transparent'
  close.style.border = 'none'
  close.style.color = '#e5e7eb' // slate-200
  close.style.cursor = 'pointer'
  close.addEventListener('click', (e) => {
    e.stopPropagation()
    root.style.display = 'none'
    root.innerHTML = ''
  })

  const content = document.createElement('div')
  content.innerHTML = svg

  const svgEl = content.querySelector('svg')
  if (svgEl instanceof SVGElement) {
    svgEl.style.width = '100%'
    svgEl.style.height = 'auto'
    svgEl.style.maxHeight = '80vh'
    svgEl.style.display = 'block'
  }

  inner.appendChild(close)
  inner.appendChild(content)
  root.appendChild(inner)
  root.style.display = 'flex'
}

function collectMermaidBlocks(root: HTMLElement): HTMLDivElement[] {
  const replacements: HTMLDivElement[] = []
  // 查找 mermaid 代码块：
  // 1. 标准格式: pre > code.language-mermaid
  // 2. 带 data-language 属性: pre[data-language="mermaid"]
  // 3. shiki 处理后可能的格式
  const selectors = [
    'pre > code.language-mermaid',
    'pre[data-language="mermaid"] > code',
    'pre[data-language="mermaid"]'
  ]

  const processedPres = new Set<HTMLElement>()

  for (const selector of selectors) {
    const elements = root.querySelectorAll(selector) as NodeListOf<HTMLElement>
    elements.forEach((el) => {
      const pre = el.tagName === 'PRE' ? el : (el.closest('pre') as HTMLElement | null)
      if (!pre || processedPres.has(pre)) return
      if (pre.closest('.mermaid-error')) return

      processedPres.add(pre)

      // 获取代码内容
      const codeEl = pre.tagName === 'PRE' ? pre.querySelector('code') : el
      const raw = codeEl?.textContent ?? pre.textContent ?? ''
      if (!raw.trim()) return

      const container = document.createElement('div')
      container.className = 'mermaid'
      // 保留原始文本内容，交给 mermaid 运行时解析
      container.textContent = raw
      pre.replaceWith(container)
      replacements.push(container)
    })
  }
  return replacements
}

/**
 * 检查元素是否在 DOM 中且可见（Mermaid 渲染需要元素可见以计算尺寸）
 */
function isElementVisible(el: HTMLElement): boolean {
  return document.body.contains(el) && el.offsetParent !== null
}

/**
 * 等待元素变为可见，带超时
 */
async function waitForElementVisible(el: HTMLElement, timeout = 500): Promise<boolean> {
  if (isElementVisible(el)) return true

  const start = Date.now()
  while (Date.now() - start < timeout) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    if (isElementVisible(el)) return true
  }
  return false
}

// 每一帧最多渲染的 Mermaid 图数量，避免一次性阻塞主线程
const MERMAID_BATCH_SIZE = 4

export async function renderMermaidIn(root: HTMLElement, theme: ThemeMode): Promise<void> {
  const containers = collectMermaidBlocks(root)
  if (containers.length === 0) return

  // 确保 root 元素在 DOM 中
  if (!document.body.contains(root)) return

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

    console.error('Mermaid bootstrap failed:', e)
    const escapeHtml = (s: string) =>
      s
        .replaceAll(/&/g, '&amp;')
        .replaceAll(/</g, '&lt;')
        .replaceAll(/>/g, '&gt;')
        .replaceAll(/"/g, '&quot;')
        .replaceAll(/'/g, '&#39;')
    const message = (e instanceof Error ? e.message : String(e)) || 'Unknown error'
    const stack = e instanceof Error && e.stack ? e.stack : message
    containers.forEach((el) => {
      const raw = el.textContent ?? ''
      el.innerHTML = `
        <div class="mermaid-error" role="alert">
          <div><strong>Mermaid 初始化失败：</strong>${escapeHtml(message)}</div>
          <pre class="mermaid-error-msg">${escapeHtml(stack)}</pre>
          <pre><code class="language-mermaid-source">${escapeHtml(raw)}</code></pre>
        </div>
      `
      el.setAttribute('data-mermaid-processed', 'error')
    })
    return
  }

  let seq = 0

  // 将每个容器的渲染封装成任务，后续按批次执行
  const tasks = containers.map((el) => {
    const id = `mmd-${Date.now()}-${seq++}`
    const chartRaw = el.textContent ?? ''
    const chart = normalizeMermaid(chartRaw)

    const renderOnce = async () => {
      // 渲染前检查元素是否仍在 DOM 中且可见
      if (!isElementVisible(el)) {
        throw new Error('Element not visible in DOM')
      }
      const { svg } = await mermaid.render(id, chart, el)
      // 渲染后再次检查元素是否还在 DOM 中
      if (!document.body.contains(el)) return
      el.innerHTML = svg
      el.setAttribute('data-mermaid-processed', '1')
      // 绑定点击放大查看
      if (!el.getAttribute('data-mermaid-lightbox')) {
        el.style.cursor = 'zoom-in'
        el.setAttribute('data-mermaid-lightbox', '1')
        el.addEventListener('click', (event) => {
          event.stopPropagation()
          const svgHtml = el.innerHTML
          openMermaidLightbox(svgHtml)
        })
      }
    }

    return async () => {
      try {
        // 等待元素变为可见
        const visible = await waitForElementVisible(el)
        if (!visible) {
          // 元素不可见，跳过渲染
          return
        }
        await renderOnce()
      } catch (err1) {
        // 如果是元素不可见导致的错误，直接跳过不重试
        if (err1 instanceof Error && err1.message === 'Element not visible in DOM') {
          return
        }
        // 首次失败，短暂等待下一帧后重试，避免瞬态错误引起闪烁

        console.warn('Mermaid first attempt failed, retrying…', err1)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        // 重试前再次检查可见性
        if (!isElementVisible(el)) return
        try {
          await renderOnce()
        } catch (err2) {
          // 如果是元素不可见导致的错误，静默跳过
          if (err2 instanceof Error && err2.message === 'Element not visible in DOM') {
            return
          }
          // 仍失败：用 error 包裹并附上源码与错误详情

          console.error('Mermaid render error (after retry):', err2)
          const escapeHtml = (s: string) =>
            s
              .replaceAll(/&/g, '&amp;')
              .replaceAll(/</g, '&lt;')
              .replaceAll(/>/g, '&gt;')
              .replaceAll(/"/g, '&quot;')
              .replaceAll(/'/g, '&#39;')
          const message = (err2 instanceof Error ? err2.message : String(err2)) || 'Unknown error'
          const stack = err2 instanceof Error && err2.stack ? err2.stack : message
          el.innerHTML = `
            <div class="mermaid-error" role="alert">
              <div><strong>Mermaid 解析失败：</strong>${escapeHtml(message)}</div>
              <pre class="mermaid-error-msg">${escapeHtml(stack)}</pre>
              <pre><code class="language-mermaid-source">${escapeHtml(chartRaw)}</code></pre>
            </div>
          `
          el.setAttribute('data-mermaid-processed', 'error')
        }
      }
    }
  })

  // 按批次分帧渲染 Mermaid 图，避免长时间同步阻塞导致 FPS 大幅下降
  for (let i = 0; i < tasks.length; i += MERMAID_BATCH_SIZE) {
    const batch = tasks.slice(i, i + MERMAID_BATCH_SIZE)
    // 同一批次内部并行渲染
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(batch.map((fn) => fn()))
    if (i + MERMAID_BATCH_SIZE < tasks.length) {
      // 让出一帧，避免长时间占用主线程
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
  }
}
