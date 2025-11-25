import { getLogger } from '../lib/logger'

export type ModuleLogger = ReturnType<typeof getLogger>

class LoggerServiceImpl {
  child(moduleName: string) {
    return getLogger(moduleName)
  }

  instrumentGlobalOrpc() {
    try {
      const log = this.child('orpc')
      const g = window as unknown as {
        orpc?: (
          path: string[],
          input: unknown,
          options?: { signal?: AbortSignal } & Record<string, unknown>
        ) => Promise<unknown>
      }
      if (typeof g.orpc === 'function') {
        const original = g.orpc as (
          path: string[],
          input: unknown,
          options?: { signal?: AbortSignal } & Record<string, unknown>
        ) => Promise<unknown>
        g.orpc = (
          path: string[],
          input: unknown,
          options?: { signal?: AbortSignal } & Record<string, unknown>
        ) => {
          const label = Array.isArray(path) ? path.join('.') : String(path)
          const started = performance.now()
          return original(path, input, options)
            .then((val) => {
              const dt = Math.round(performance.now() - started)
              log.debug(`ok: ${label}`, { duration_ms: dt })
              return val
            })
            .catch((err: unknown) => {
              const dt = Math.round(performance.now() - started)
              log.error(`fail: ${label}`, err instanceof Error ? err : undefined, {
                duration_ms: dt
              })
              throw err
            })
        }
      }
    } catch {}
  }
}

export const loggerService = new LoggerServiceImpl()
