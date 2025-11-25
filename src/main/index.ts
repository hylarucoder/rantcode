import { app, BrowserWindow, ipcMain, crashReporter } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { setupOrpcBridge } from './orpcBridge'
import { setupProductionExceptionHandlers, logRendererTelemetry, setupLoggingIPC } from './logging'
import { windowService } from './windowService'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loggerService } from './services/loggerService'
import { readGeneralSettings } from './settings/general'
import type { GeneralSettings } from './settings/general'
import { onGeneralChange } from './settings/store'
import { applyAutoLaunch } from './settings/autoLaunch'
import { generalSettingsSchema } from '../shared/orpc/schemas'

// Window creation moved to WindowService

// 开发/生产用户数据隔离：开发环境修改 userData 路径，避免污染正式数据
try {
  if (!app.isPackaged || process.env.NODE_ENV !== 'production') {
    const devUserData = path.join(app.getPath('appData'), `${app.getName()} (Dev)`)
    app.setPath('userData', devUserData)
  }
} catch {}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// Early settings to decide platform-level behavior
function readEarlySettings(): GeneralSettings {
  try {
    const userData = app.getPath('userData')
    // Prefer electron-store file
    const storeFile = path.join(userData, 'settings.json')
    try {
      const raw = fs.readFileSync(storeFile, 'utf8')
      const parsed = JSON.parse(raw)
      const general = parsed?.general
      const result = generalSettingsSchema.safeParse(general)
      if (result.success) return result.data
    } catch {}
    // Fallback legacy file
    const legacy = path.join(userData, 'general.settings.json')
    const raw = fs.readFileSync(legacy, 'utf8')
    const result = generalSettingsSchema.safeParse(JSON.parse(raw))
    if (result.success) return result.data
  } catch {
    // ignore and use defaults
  }
  // Defaults from schema
  return generalSettingsSchema.parse({})
}

const early = readEarlySettings()
// Wayland Shortcuts portal (global shortcuts on Wayland)
try {
  const enablePortal = early.appearance.waylandShortcutsPortal !== false
  if (process.platform === 'linux' && enablePortal) {
    app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')
  }
} catch {}

// Hardware acceleration toggle
try {
  if (early.appearance.hardwareAcceleration === false) {
    app.disableHardwareAcceleration()
  }
} catch {}

// Enforce single-instance: keep one running app and focus existing window
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  // Production global exception handlers (uncaught/unhandled)
  setupProductionExceptionHandlers()
  const lifeLog = loggerService.child('app.lifecycle')
  // Start crash reporter as early as possible to capture native crashes
  try {
    crashReporter.start({
      uploadToServer: false,
      compress: true,
      ignoreSystemCrashHandler: false,
      extra: {
        app_version: app.getVersion(),
        process: 'main',
        platform: process.platform,
        arch: process.arch
      }
    })
  } catch {
    // ignore crash reporter start errors
  }

  // Re-focus existing window when a second instance is launched
  app.on('second-instance', () => {
    lifeLog.info('second-instance')
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    const t0 = Date.now()
    lifeLog.info('app-ready')
    // Set app user model id for Windows to match electron-builder appId
    electronApp.setAppUserModelId('com.electron.app')

    // Setup RPC bridge between renderer and main process (synchronous, must be first)
    setupLoggingIPC()
    setupOrpcBridge()

    // Create window immediately (synchronous critical path)
    windowService.createMainWindow()
    lifeLog.info('main-window-created')

    const dt = Date.now() - t0
    lifeLog.info(`initial window ready in ${dt}ms`)

    // Background initialization (after window is visible)
    ;(async () => {
      const t1 = Date.now()
      try {
        // Warm up GPU process (background)
        try {
          void app.getGPUInfo('basic')
        } catch {}
        const dt1 = Date.now() - t1
        lifeLog.debug(`GPU warmup in ${dt1}ms`)

        // Load settings (background)
        const t2 = Date.now()
        const settings = await readGeneralSettings()
        windowService.configure({
          zoomFactor: settings.zoomFactor,
          appearance: {
            transparent: settings.appearance.transparent,
            vibrancy: settings.appearance.vibrancy
          }
        })
        void applyAutoLaunch(settings.autoLaunch)
        onGeneralChange((next, prev) => {
          windowService.configure({
            zoomFactor: next.zoomFactor,
            appearance: {
              transparent: next.appearance.transparent,
              vibrancy: next.appearance.vibrancy
            }
          })
          if (prev?.autoLaunch !== next.autoLaunch) {
            void applyAutoLaunch(next.autoLaunch)
          }
        })
        const dt2 = Date.now() - t2
        lifeLog.debug(`settings loaded in ${dt2}ms`)
      } catch {
        // ignore
      }
    })()

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    app.on('browser-window-created', (_, window) => {
      lifeLog.debug('browser-window-created', { id: window.id })
      // Track renderer responsiveness and exits for diagnostics
      window.on('unresponsive', () => {
        try {
          crashReporter.addExtraParameter('renderer_unresponsive_at', new Date().toISOString())
        } catch {}
        lifeLog.warn('renderer-unresponsive', { id: window.id })
      })
      window.webContents.on('render-process-gone', (_event, details) => {
        try {
          crashReporter.addExtraParameter('renderer_gone_reason', `${details.reason}`)
          if (details.exitCode !== undefined) {
            crashReporter.addExtraParameter('renderer_exit_code', String(details.exitCode))
          }
        } catch {}
        lifeLog.warn('render-process-gone', { reason: details.reason, code: details.exitCode })
      })
      window.webContents.on('before-input-event', (event, input) => {
        const isF12 = input.code === 'F12'
        const isToggleDevtools =
          (input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i'
        if (isF12 || isToggleDevtools) {
          event.preventDefault()
          if (!window.webContents.isDevToolsOpened()) {
            window.webContents.openDevTools({ mode: 'detach' })
          } else {
            window.webContents.closeDevTools()
          }
          return
        }

        // Optional: Cmd/Ctrl+Alt+J opens window (UI) devtools
        const isWindowDevtools =
          (input.control || input.meta) && input.alt && input.key.toLowerCase() === 'j'
        if (isWindowDevtools) {
          event.preventDefault()
          if (!window.webContents.isDevToolsOpened()) {
            window.webContents.openDevTools({ mode: 'detach' })
          } else {
            window.webContents.closeDevTools()
          }
        }
      })
    })

    // IPC helpers
    ipcMain.on('ping', () => console.log('pong'))

    // (no ad-hoc IPC fallbacks; rely on oRPC projects.pickRepoPath)

    // Telemetry from renderer for diagnostics
    ipcMain.on('telemetry:renderer-error', (_evt, payload) => {
      logRendererTelemetry(payload)
      const kind = payload?.type || 'unknown'
      const msg = payload?.message || payload?.info || ''
      console.warn('[telemetry]', kind, msg)
    })

    // Settings IPC removed in favor of oRPC app.getGeneral/setGeneral

    // window maximize toggle moved to oRPC: app.toggleMaximize

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) {
        lifeLog.info('activate-no-window')
        windowService.createMainWindow()
      } else {
        lifeLog.debug('activate')
      }
    })
  })
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  loggerService.child('app.lifecycle').info('window-all-closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
