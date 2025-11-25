import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
// (types consumed via bridges)
import { setupTelemetry } from './telemetry'
import { setupOrpc } from './orpc'
import { createAgentsBridge } from './bridges/agents'
import { createLoggerBridge } from './bridges/logger'
import { createDocsBridge } from './bridges/docs'
// import { createRouterUtils } from '@orpc/tanstack-query'
import { createProjectsBridge } from './bridges/projects'

// 1) Telemetry hooks (errors/longtask/crash extra)
setupTelemetry()

// 2) oRPC + notify side channel
const { client: orpcClient, subscribeNotify } = setupOrpc()
// 2.1) 在 preload 内部可选使用（当前不暴露 utils，避免跨上下文传递 Proxy）
// const orpcUtils = createRouterUtils(orpcClient)

// 3) Bootstrap theme and capture initial settings (for window.api)
type WindowWithApi = Window & {
  api?: {
    initialGeneral?: { language?: string; theme?: 'light' | 'dark' }
    [key: string]: unknown
  }
}

const initialGeneral: { language?: string; theme?: 'light' | 'dark' } = {}
;(async () => {
  try {
    const general = await orpcClient.app.getGeneral()
    const theme = general.theme
    document.documentElement.classList.toggle('dark', theme === 'dark')
    initialGeneral.language = general.language
    initialGeneral.theme = theme
    // If api already exposed, backfill
    try {
      const api = (window as WindowWithApi).api
      if (api && !('initialGeneral' in api)) {
        api.initialGeneral = { language: general.language, theme }
      }
    } catch {}
  } catch {
    // ignore; renderer fallbacks
  }
})()

// 4) Forward main-process oRPC errors to devtools
ipcRenderer.on(
  'orpc:error',
  (_event, payload: { label?: string; stack?: string; message?: string }) => {
    const label = payload?.label || 'unknown'
    const msg = payload?.stack || payload?.message || ''

    console.error(`[oRPC][main->renderer] ${label}`, msg)
  }
)

// 5) Bridges (agents + projects + logger)
const agentsBridge = createAgentsBridge(orpcClient, subscribeNotify)
const docsBridge = createDocsBridge(orpcClient, subscribeNotify)
const projectsBridge = createProjectsBridge(orpcClient)
const loggerBridge = createLoggerBridge()

// 6) 暴露：提供通用 orpc 调用函数到 window.api，避免跨上下文暴露 Proxy
function orpcCall(path: readonly string[], input: unknown): Promise<unknown> {
  try {
    let node: Record<string, unknown> = orpcClient as Record<string, unknown>
    for (const key of path) {
      node = node?.[key] as Record<string, unknown>
    }
    if (typeof node !== 'function') {
      throw new Error('Invalid oRPC path')
    }
    return (node as (input: unknown) => Promise<unknown>)(input)
  } catch (err) {
    return Promise.reject(err)
  }
}

const api = {
  electron: electronAPI,
  orpcCall,
  agents: agentsBridge,
  docs: docsBridge,
  projects: projectsBridge,
  logger: loggerBridge,
  initialGeneral
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  ;(window as WindowWithApi).api = api
}

// 7) logger 已通过 window.api 暴露，无需额外逻辑
