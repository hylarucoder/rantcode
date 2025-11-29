import { app, BrowserWindow, ipcMain, crashReporter } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { execSync } from 'node:child_process'
import * as os from 'node:os'
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
import { initDatabase, closeDatabase } from './db/client'
import { humanizeDuration } from '../shared/utils/humanize'

// 修复 macOS/Linux 打包后 PATH 环境变量问题
// GUI 应用不会继承 shell 的 PATH，导致找不到 node/codex/claude-code 等命令
function fixPath(): void {
  if (process.platform === 'win32') return

  try {
    // 获取用户默认 shell
    const shell = process.env.SHELL || '/bin/zsh'
    // 运行 shell 并获取 PATH 环境变量
    const result = execSync(`${shell} -ilc 'echo $PATH'`, {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, DISABLE_AUTO_UPDATE: 'true' }
    }).trim()

    if (result) {
      // 移除可能的 ANSI 转义序列
      const cleanPath = result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
      process.env.PATH = cleanPath
    }
  } catch {
    // 如果获取失败，添加常见路径作为备选
    const fallbackPaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      `${process.env.HOME}/.nvm/versions/node/*/bin`,
      `${process.env.HOME}/.local/bin`,
      `${process.env.HOME}/bin`,
      process.env.PATH
    ].filter(Boolean)
    process.env.PATH = fallbackPaths.join(':')
  }
}

fixPath()

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
function getEarlyConfigRoot(): string {
  const home = os.homedir()
  const isDev = !app.isPackaged || process.env.NODE_ENV !== 'production'
  return path.join(home, isDev ? '.rantcode-dev' : '.rantcode')
}

function readEarlySettings(): GeneralSettings {
  try {
    const configRoot = getEarlyConfigRoot()
    // Prefer electron-store file
    const storeFile = path.join(configRoot, 'settings.json')
    try {
      const raw = fs.readFileSync(storeFile, 'utf8')
      const parsed = JSON.parse(raw)
      const general = parsed?.general
      const result = generalSettingsSchema.safeParse(general)
      if (result.success) return result.data
    } catch {}
    // Fallback legacy file
    const legacy = path.join(configRoot, 'general.settings.json')
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

  app.whenReady().then(async () => {
    const t0 = Date.now()
    lifeLog.info('app-ready')
    // Set app user model id for Windows to match electron-builder appId
    electronApp.setAppUserModelId('com.electron.app')

    // Initialize SQLite database
    try {
      await initDatabase()
      lifeLog.info('database-initialized')
    } catch (err) {
      lifeLog.error('database initialization failed', { error: (err as Error).message })
    }

    // Setup RPC bridge between renderer and main process (synchronous, must be first)
    setupLoggingIPC()
    setupOrpcBridge()

    // Create window immediately (synchronous critical path)
    windowService.createMainWindow()
    lifeLog.info('main-window-created')

    const dt = Date.now() - t0
    lifeLog.info(`initial window ready in ${humanizeDuration(dt)}`)

    // Background initialization (after window is visible)
    ;(async () => {
      const t1 = Date.now()
      try {
        // Warm up GPU process (background)
        try {
          void app.getGPUInfo('basic')
        } catch {}
        const dt1 = Date.now() - t1
        lifeLog.debug(`GPU warmup in ${humanizeDuration(dt1)}`)

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
        lifeLog.debug(`settings loaded in ${humanizeDuration(dt2)}`)
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

// App quit handler
app.on('before-quit', () => {
  loggerService.child('app.lifecycle').info('app-quitting')
  // Close database connection
  try {
    closeDatabase()
  } catch {
    // ignore close errors
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
