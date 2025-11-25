import type winston from 'winston'
import { getLogger } from '../logging'

export type ModuleLogger = {
  error: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  info: (message: string, meta?: Record<string, unknown>) => void
  debug: (message: string, meta?: Record<string, unknown>) => void
}

class LoggerServiceImpl {
  private base: winston.Logger
  constructor() {
    this.base = getLogger()
  }

  child(moduleName: string): ModuleLogger {
    const log = this.base
    const wrap =
      (level: 'error' | 'warn' | 'info' | 'debug') =>
      (message: string, meta?: Record<string, unknown>) => {
        log.log(level, message, { module: moduleName, ...(meta || {}) })
      }
    return {
      error: wrap('error'),
      warn: wrap('warn'),
      info: wrap('info'),
      debug: wrap('debug')
    }
  }
}

export const loggerService = new LoggerServiceImpl()
