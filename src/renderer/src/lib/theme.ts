// Utilities to switch theme without ugly color transition flashes

export type ThemeMode = 'system' | 'light' | 'dark'

function disableColorTransitions(): () => void {
  const style = document.createElement('style')
  style.setAttribute('data-theme-transition', 'true')
  style.appendChild(
    document.createTextNode(
      '* { transition: none !important; }\n*::before { transition: none !important; }\n*::after { transition: none !important; }'
    )
  )
  document.head.appendChild(style)
  // Ensure at least two frames so browsers apply/removal reliably
  const raf1 = 0
  const raf2 = 0
  const cleanup = () => {
    if (style.parentNode) {
      style.parentNode.removeChild(style)
    }
  }
  // Schedule best-effort cleanup even if caller forgets
  const fallback = window.setTimeout(cleanup, 300)
  // Return a remover that cancels raf chain and timeout then removes style
  return () => {
    if (raf1) cancelAnimationFrame(raf1)
    if (raf2) cancelAnimationFrame(raf2)
    clearTimeout(fallback)
    cleanup()
  }
}

export function setRootDarkWithNoTransition(nextDark: boolean): void {
  if (typeof document === 'undefined') return
  const remove = disableColorTransitions()
  // Force a frame so the style tag takes effect before toggling
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      document.documentElement.classList.toggle('dark', nextDark)
      // Another frame before cleanup helps some engines
      requestAnimationFrame(() => remove())
    })
  } else {
    document.documentElement.classList.toggle('dark', nextDark)
    remove()
  }
}

export function applyThemeMode(mode: ThemeMode): void {
  if (mode === 'system') {
    const prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    setRootDarkWithNoTransition(prefersDark)
  } else {
    setRootDarkWithNoTransition(mode === 'dark')
  }
}
