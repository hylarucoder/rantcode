import { scan } from 'react-scan'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import './lib/i18n' // 初始化 i18n
import { ensureMarkdownPipelinePreloaded } from './lib/markdown'
import { loggerService } from './services/loggerService'

function bootstrapTheme() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  // Prefer settings provided by preload from main process
  const initial = (
    window as unknown as {
      api?: { initialGeneral?: { theme?: 'light' | 'dark'; language?: string } }
    }
  ).api?.initialGeneral
  const ls = window.localStorage.getItem('theme')
  const theme = initial?.theme || (ls === 'light' ? 'light' : 'dark')
  root.classList.toggle('dark', theme === 'dark')
  // Mirror to localStorage for next cold start
  window.localStorage.setItem('theme', theme)
  if (initial?.language) window.localStorage.setItem('language', initial.language)
}

bootstrapTheme()
void ensureMarkdownPipelinePreloaded()
// Instrument oRPC global and log boot milestones
loggerService.instrumentGlobalOrpc()
loggerService.child('app.lifecycle').info('renderer-bootstrap')

// 仅在开发环境启用 React Scan，帮助分析组件渲染性能
if (import.meta.env.DEV) {
  scan({
    enabled: true,
    showToolbar: true,
    animationSpeed: 'fast',
    // 如需更重型分析可以打开这一项，但会有额外开销
    trackUnnecessaryRenders: false
  })
}

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
