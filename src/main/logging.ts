import { app, crashReporter, ipcMain } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import winston from 'winston'
import 'winston-daily-rotate-file'
import { getLogsPath } from './paths'

type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly'

export type LogPayload = {
  level: LogLevel
  module?: string
  message: string
  context?: Record<string, unknown>
  stack?: string
}

let logger: winston.Logger | null = null

// Extend CrashReporter type to include undocumented getParameters method
interface CrashReporterExtended {
  getParameters?: () => Record<string, string>
}

function getCrashExtra(): Record<string, string> | undefined {
  try {
    const params = (crashReporter as unknown as CrashReporterExtended)?.getParameters?.()
    if (params && typeof params === 'object') return params as Record<string, string>
  } catch {}
  return undefined
}

function buildLogger(): winston.Logger {
  const userLogs = getLogsPath()
  // ensure dir
  fs.mkdir(userLogs, { recursive: true }).catch(() => {})

  const { combine, timestamp, printf, colorize, splat, errors, json, metadata } = winston.format

  const consoleFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'HH:mm:ss.SSS' }),
    errors({ stack: true }),
    splat(),
    metadata({ fillExcept: ['message', 'level', 'timestamp', 'module'] }),
    printf(({ level, message, timestamp, module, stack, metadata }) => {
      const mod = module ? `[${module}]` : ''
      const ctx = metadata && Object.keys(metadata).length ? ` ${JSON.stringify(metadata)}` : ''
      const line = stack ? `${message}\n${stack}` : message
      return `${timestamp} ${level} ${mod} ${line}${ctx}`
    })
  )

  const fileFormat = combine(timestamp(), errors({ stack: true }), splat(), json())

  const DailyRotate = (
    winston.transports as unknown as {
      DailyRotateFile: new (...args: unknown[]) => winston.transport
    }
  ).DailyRotateFile

  const transports: winston.transport[] = [
    new DailyRotate({
      filename: join(userLogs, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '10m',
      zippedArchive: true,
      level: process.env.RANTCODE_FILE_LOG_LEVEL || 'info',
      format: fileFormat
    })
  ]

  if (process.env.NODE_ENV !== 'production' || process.env.RANTCODE_CONSOLE_LOG === '1') {
    transports.push(
      new winston.transports.Console({
        level: process.env.RANTCODE_CONSOLE_LOG_LEVEL || 'debug',
        format: consoleFormat
      })
    )
  }

  return winston.createLogger({
    level: (process.env.RANTCODE_LOG_LEVEL as LogLevel) || 'info',
    defaultMeta: {
      pid: process.pid,
      process: 'main',
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch
    },
    transports
  })
}

export function getLogger(): winston.Logger {
  if (!logger) logger = buildLogger()
  return logger
}

export function setupLoggingIPC(): void {
  const log = getLogger()
  ipcMain.on('log:to-main', (_evt, payload: LogPayload) => {
    try {
      const { level, module, message, context, stack } = payload || ({} as LogPayload)
      const meta = {
        module,
        context,
        crashExtra: getCrashExtra()
      }
      if (stack) {
        log.log(level || 'info', message, { ...meta, stack })
      } else {
        log.log(level || 'info', message, meta)
      }
    } catch (e) {
      console.error('[log:to-main] failed', e)
    }
  })
}

export function setupProductionExceptionHandlers(): void {
  if (process.env.NODE_ENV !== 'production') return
  const log = getLogger()
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', { stack: err?.stack, message: err?.message, module: 'process' })
  })
  process.on('unhandledRejection', (reason: unknown) => {
    const msg =
      typeof reason === 'string'
        ? reason
        : (reason as { message?: string })?.message || 'unhandledRejection'
    const stack = (reason as { stack?: string })?.stack
    log.error('unhandledRejection', { message: msg, stack, module: 'process' })
  })
}

export function logRendererTelemetry(payload: {
  type?: string
  message?: string
  stack?: string
  info?: unknown
}): void {
  const kind = payload?.type || 'renderer-telemetry'
  const level: LogLevel = kind === 'longtask' ? 'warn' : 'error'
  const msg = payload?.message || (payload?.info ? JSON.stringify(payload.info) : '')
  const log = getLogger()
  log.log(level, msg || kind, {
    module: 'renderer',
    context: payload?.info,
    stack: payload?.stack,
    crashExtra: getCrashExtra()
  })
}
