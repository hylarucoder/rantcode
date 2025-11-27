import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import App from './App'
import './index.css'
import { ensureMarkdownPipelinePreloaded } from './lib/markdown'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
