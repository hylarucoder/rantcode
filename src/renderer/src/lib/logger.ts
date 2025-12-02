type Level = 'error' | 'warn' | 'info' | 'debug'

type LoggerAPI = {
  error: (msg: string, err?: unknown, ctx?: Record<string, unknown>) => void
  warn: (msg: string, ctx?: Record<string, unknown>) => void
  info: (msg: string, ctx?: Record<string, unknown>) => void
  debug: (msg: string, ctx?: Record<string, unknown>) => void
}

type LoggerBridge = {
  create: (moduleName: string) => LoggerAPI
  logToMain: (payload: {
    level: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly'
    module?: string
    message: string
    context?: Record<string, unknown>
  }) => void
}

export function getLogger(moduleName: string): LoggerAPI {
  const bridge = (window as unknown as { api?: { logger?: LoggerBridge } }).api?.logger
  if (bridge && typeof bridge.create === 'function') return bridge.create(moduleName)

  // Fallback: console only
  const format = (level: Level, msg: string, ctx?: Record<string, unknown>) => {
    const time = new Date().toLocaleTimeString()
    const tag = `[${moduleName}]`

    const method: 'error' | 'warn' | 'log' =
      level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
    // eslint-disable-next-line no-console -- logger fallback implementation
    console[method](`${time} ${level.toUpperCase()} ${tag} ${msg}`, ctx || '')
  }
  return {
    error: (msg, _err, ctx) => format('error', msg, ctx),
    warn: (msg, ctx) => format('warn', msg, ctx),
    info: (msg, ctx) => format('info', msg, ctx),
    debug: (msg, ctx) => format('debug', msg, ctx)
  }
}

export function logToMain(
  level: Level,
  message: string,
  context?: Record<string, unknown>,
  moduleName = 'renderer'
): void {
  ;(window as unknown as { api?: { logger?: LoggerBridge } }).api?.logger?.logToMain({
    level,
    module: moduleName,
    message,
    context
  })
}
