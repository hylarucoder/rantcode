import { crashReporter, ipcRenderer } from 'electron'

// Type definitions for PerformanceObserver API
type PerformanceObserverCallback = (
  list: { getEntries(): ReadonlyArray<unknown> },
  observer: PerformanceObserver
) => void

interface PerformanceObserverConstructor {
  new (callback: PerformanceObserverCallback): PerformanceObserver
}

interface PerformanceObserver {
  observe(options: { entryTypes: string[] }): void
  disconnect(): void
}

type WindowWithPerformanceObserver = Window & {
  PerformanceObserver?: PerformanceObserverConstructor
}

function setCrashExtra(key: string, value: unknown): void {
  try {
    const raw = typeof value === 'string' ? value : JSON.stringify(value)
    const sanitized = raw.split('\u0000').join('\uFFFD')
    const truncated = sanitized.length > 8192 ? sanitized.slice(0, 8192) + '…' : sanitized
    crashReporter.addExtraParameter(key, truncated)
  } catch {}
}

export function setupTelemetry(): void {
  try {
    crashReporter.start({
      uploadToServer: false,
      compress: true,
      ignoreSystemCrashHandler: false,
      extra: { process: 'renderer' }
    })
  } catch {}

  try {
    if (process.env.NODE_ENV === 'production') {
      process.on('uncaughtException', (err) => {
        const msg = (err && (err as Error).message) || 'preload uncaughtException'
        const stack = (err && (err as Error).stack) || ''
        setCrashExtra('preload_uncaught_message', msg)
        if (stack) setCrashExtra('preload_uncaught_stack', stack)
        setCrashExtra('preload_uncaught_at', new Date().toISOString())
        ipcRenderer.send('telemetry:renderer-error', {
          type: 'preload-uncaughtException',
          message: msg,
          stack,
          t: Date.now()
        })
      })
      process.on('unhandledRejection', (reason) => {
        const msg =
          typeof reason === 'string'
            ? reason
            : ((reason as { message?: string })?.message ?? 'preload unhandledRejection')
        const stack = (reason as { stack?: string })?.stack || ''
        setCrashExtra('preload_unhandled_message', msg)
        if (stack) setCrashExtra('preload_unhandled_stack', stack)
        setCrashExtra('preload_unhandled_at', new Date().toISOString())
        ipcRenderer.send('telemetry:renderer-error', {
          type: 'preload-unhandledRejection',
          message: msg,
          stack,
          t: Date.now()
        })
      })
    }
  } catch {}

  try {
    window.addEventListener('error', (ev) => {
      const message = (ev?.error?.message || ev?.message || 'Unknown error') as string
      const stack = (ev?.error?.stack || '') as string
      setCrashExtra('last_js_event_type', 'error')
      setCrashExtra('last_js_error_message', message)
      if (stack) setCrashExtra('last_js_error_stack', stack)
      setCrashExtra('last_js_error_at', new Date().toISOString())
      ipcRenderer.send('telemetry:renderer-error', { type: 'error', message, stack, t: Date.now() })
    })
    window.addEventListener('unhandledrejection', (ev) => {
      const reason = (ev?.reason ?? 'unknown') as unknown
      const message =
        typeof reason === 'string'
          ? reason
          : (reason as { message?: string })?.message || 'unhandledrejection'
      const stack = (reason as { stack?: string })?.stack || ''
      setCrashExtra('last_js_event_type', 'unhandledrejection')
      setCrashExtra('last_js_rejection_message', message)
      if (stack) setCrashExtra('last_js_rejection_stack', stack)
      setCrashExtra('last_js_rejection_at', new Date().toISOString())
      ipcRenderer.send('telemetry:renderer-error', {
        type: 'unhandledrejection',
        message,
        stack,
        t: Date.now()
      })
    })
  } catch {}

  try {
    const LongTaskObserver = (window as WindowWithPerformanceObserver).PerformanceObserver
    if (typeof LongTaskObserver === 'function') {
      const observer = new LongTaskObserver((list: { getEntries(): ReadonlyArray<unknown> }) => {
        for (const entry of list.getEntries()) {
          const et = (entry as { entryType?: string }).entryType
          if (et === 'longtask') {
            const { startTime, duration } = entry as {
              startTime: number
              duration: number
              entryType: string
            }
            const info = { startTime, duration }
            setCrashExtra('last_longtask', info)
            setCrashExtra('last_longtask_at', new Date().toISOString())
            ipcRenderer.send('telemetry:renderer-error', { type: 'longtask', info, t: Date.now() })
          }
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
    }
  } catch {}
}
