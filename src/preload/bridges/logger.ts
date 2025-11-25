import { ipcRenderer } from 'electron'

export type RendererLogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly'

function matchGlob(pattern: string, text: string): boolean {
  if (pattern === '*') return true
  const parts = pattern
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.some((p) => {
    const esc = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp('^' + esc + '$', 'i').test(text)
  })
}

const ENV_MODULE_FILTER = process.env.RANTCODE_LOG_MODULES || process.env.DEBUG || '*'
const ENV_LEVEL_THRESHOLD = (process.env.RANTCODE_LOG_TO_MAIN_LEVEL || 'error').toLowerCase()
const levelOrder: RendererLogLevel[] = [
  'error',
  'warn',
  'info',
  'http',
  'verbose',
  'debug',
  'silly'
]

function shouldSendToMain(level: RendererLogLevel): boolean {
  const th = levelOrder.indexOf(ENV_LEVEL_THRESHOLD as RendererLogLevel)
  const lv = levelOrder.indexOf(level)
  if (th < 0 || lv < 0) return level === 'error'
  return lv <= th
}

function formatConsole(
  level: RendererLogLevel,
  mod: string,
  message: string,
  context?: unknown
): void {
  const time = new Date().toLocaleTimeString()
  const tag = `[${mod}]`
  const base = `%c${time} %c${level.toUpperCase()} %c${tag} %c${message}`
  const styles = [
    'color:#999',
    level === 'error'
      ? 'color:#fff;background:#d33;padding:1px 4px;border-radius:3px'
      : level === 'warn'
        ? 'color:#000;background:#f7c948;padding:1px 4px;border-radius:3px'
        : 'color:#fff;background:#4c78ff;padding:1px 4px;border-radius:3px',
    'color:#6a6',
    'color:#222'
  ]
  const args = context ? [base, ...styles, context] : [base, ...styles]
  const method: 'error' | 'warn' | 'log' =
    level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'

  console[method](...args)
}

function sendToMain(
  level: RendererLogLevel,
  mod: string,
  message: string,
  context?: Record<string, unknown>,
  stack?: string
): void {
  ipcRenderer.send('log:to-main', { level, module: mod, message, context, stack })
}

function makeRendererLogger(mod: string) {
  const test = (m: string) => matchGlob(ENV_MODULE_FILTER || '*', m)
  function logFactory(level: RendererLogLevel) {
    return (message: string, context?: Record<string, unknown>) => {
      if (!test(mod)) return
      formatConsole(level, mod, message, context)
      if (shouldSendToMain(level)) sendToMain(level, mod, message, context)
    }
  }
  return {
    error: (message: string, err?: unknown, context?: Record<string, unknown>) => {
      let stack: string | undefined
      let msg = message
      if (err instanceof Error) {
        stack = err.stack
        msg = `${message}: ${err.message}`
      } else if (typeof err === 'string') {
        msg = `${message}: ${err}`
      }
      if (!test(mod)) return
      formatConsole('error', mod, msg, context)
      if (shouldSendToMain('error')) sendToMain('error', mod, msg, context, stack)
    },
    warn: logFactory('warn'),
    info: logFactory('info'),
    debug: logFactory('debug')
  }
}

export type LoggerAPI = ReturnType<typeof makeRendererLogger>

export function createLoggerBridge() {
  return {
    create: (moduleName: string) => makeRendererLogger(moduleName),
    logToMain: (payload: {
      level: RendererLogLevel
      module?: string
      message: string
      context?: Record<string, unknown>
    }) => {
      sendToMain(payload.level, payload.module || 'renderer', payload.message, payload.context)
    }
  }
}

export type LoggerBridge = ReturnType<typeof createLoggerBridge>
