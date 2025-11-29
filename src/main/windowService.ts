import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
// electron-window-state is CJS; default import works at runtime
// Types are not provided; treat as untyped module
import windowStateKeeper from 'electron-window-state'
import { getConfigRoot } from './paths'

import icon from '../../resources/icon.png?asset'
const appIcon = nativeImage.createFromPath(icon)

// Extend BrowserWindow to support newer Electron vibrancy strings on Windows
type BrowserWindowWithExtendedVibrancy = BrowserWindow & {
  setVibrancy(type: string | null): void
}

export type ChildWindowKey = string

export class WindowService {
  private mainWindow: BrowserWindow | null = null
  private miniWindow: BrowserWindow | null = null
  private children = new Map<ChildWindowKey, BrowserWindow>()
  private zoomFactor = 1
  private appearance: {
    transparent: boolean
    vibrancy: boolean | string
  } = { transparent: false, vibrancy: false }

  configure(opts: {
    zoomFactor?: number
    appearance?: { transparent?: boolean; vibrancy?: boolean | string }
  }): void {
    if (typeof opts.zoomFactor === 'number') this.zoomFactor = opts.zoomFactor
    if (opts.appearance) {
      this.appearance = {
        transparent: opts.appearance.transparent ?? this.appearance.transparent,
        vibrancy: opts.appearance.vibrancy ?? this.appearance.vibrancy
      }
    }
  }

  private applyZoomPersistence(win: BrowserWindow): void {
    const apply = () => {
      try {
        win.webContents.setZoomFactor(this.zoomFactor)
      } catch {}
    }
    apply()
    let resizeTimer: NodeJS.Timeout | null = null
    const schedule = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(apply, 150)
    }
    win.on('ready-to-show', apply)
    win.on('show', apply)
    win.on('focus', apply)
    win.on('restore', apply)
    win.on('maximize', apply)
    win.on('unmaximize', apply)
    win.on('enter-full-screen', apply)
    win.on('leave-full-screen', apply)
    win.on('resize', schedule)
    win.webContents.on('did-finish-load', apply)
    win.webContents.on('dom-ready', apply)
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  showMainWindow(): void {
    const win = this.mainWindow
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  createMainWindow(): BrowserWindow {
    // Persist and restore bounds/maximized/fullscreen state
    const state = windowStateKeeper({
      file: 'main-window.json',
      path: getConfigRoot(),
      defaultWidth: 1200,
      defaultHeight: 800,
      maximize: true,
      fullScreen: true
    })

    const vib = this.appearance.vibrancy
    const enableTransparent = this.appearance.transparent || !!vib
    // macOS 在开发环境下，显示 dock 图标
    try {
      if (process.platform === 'darwin' && !app.isReady()) {
        // no-op; ensure app ready elsewhere
      }
      if (process.platform === 'darwin' && appIcon && !appIcon.isEmpty()) {
        app.dock?.setIcon(appIcon)
      }
    } catch {}

    const win = new BrowserWindow({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      show: false,
      autoHideMenuBar: true,
      transparent: enableTransparent,
      backgroundColor: enableTransparent ? '#00000000' : undefined,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
      titleBarOverlay: {
        height: 40,
        color: '#00000000',
        symbolColor: '#1f1f1f'
      },
      ...(process.platform === 'darwin'
        ? {
            trafficLightPosition: { x: 12, y: 10 } as const
          }
        : {}),
      // Linux/Windows 设置窗口图标；macOS 通过 dock 图标控制
      ...(process.platform !== 'darwin' && !appIcon.isEmpty() ? { icon: appIcon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        sandbox: false
      }
    })

    if (vib) {
      try {
        if (process.platform === 'darwin') {
          win.setVibrancy(
            (typeof vib === 'string' ? vib : 'under-window') as Parameters<
              BrowserWindow['setVibrancy']
            >[0]
          )
        } else if (process.platform === 'win32') {
          // Acrylic/Mica like effect
          ;(win as BrowserWindowWithExtendedVibrancy).setVibrancy(
            typeof vib === 'string' ? vib : 'acrylic'
          )
        }
      } catch {}
    }

    state.manage(win)

    win.on('ready-to-show', () => {
      win.show()
    })

    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    win.on('closed', () => {
      this.mainWindow = null
    })

    this.mainWindow = win
    this.applyZoomPersistence(win)
    return win
  }

  createMiniWindow(): BrowserWindow {
    if (this.miniWindow && !this.miniWindow.isDestroyed()) {
      this.miniWindow.focus()
      return this.miniWindow
    }

    const state = windowStateKeeper({
      file: 'mini-window.json',
      path: getConfigRoot(),
      defaultWidth: 360,
      defaultHeight: 120,
      maximize: false,
      fullScreen: false
    })

    const vib = this.appearance.vibrancy
    const enableTransparent = this.appearance.transparent || !!vib
    const win = new BrowserWindow({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      useContentSize: true,
      resizable: true,
      frame: true,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      transparent: enableTransparent,
      backgroundColor: enableTransparent ? '#00000000' : undefined,
      ...(process.platform !== 'darwin' && !appIcon.isEmpty() ? { icon: appIcon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        sandbox: false
      }
    })

    if (vib) {
      try {
        if (process.platform === 'darwin') {
          win.setVibrancy(
            (typeof vib === 'string' ? vib : 'under-window') as Parameters<
              BrowserWindow['setVibrancy']
            >[0]
          )
        } else if (process.platform === 'win32') {
          ;(win as BrowserWindowWithExtendedVibrancy).setVibrancy(
            typeof vib === 'string' ? vib : 'acrylic'
          )
        }
      } catch {}
    }

    state.manage(win)

    win.on('closed', () => {
      this.miniWindow = null
    })

    this.miniWindow = win
    this.applyZoomPersistence(win)
    return win
  }

  createChildWindow(
    key: ChildWindowKey,
    options?: {
      width?: number
      height?: number
      title?: string
      parent?: BrowserWindow | null
      modal?: boolean
      route?: string
    }
  ): BrowserWindow {
    const existing = this.children.get(key)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return existing
    }

    const state = windowStateKeeper({
      file: `child-${key}.json`,
      path: getConfigRoot(),
      defaultWidth: options?.width ?? 800,
      defaultHeight: options?.height ?? 600,
      maximize: true,
      fullScreen: false
    })

    const vib = this.appearance.vibrancy
    const enableTransparent = this.appearance.transparent || !!vib
    const win = new BrowserWindow({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      show: true,
      autoHideMenuBar: true,
      parent: options?.parent ?? undefined,
      modal: options?.modal ?? false,
      transparent: enableTransparent,
      backgroundColor: enableTransparent ? '#00000000' : undefined,
      ...(process.platform !== 'darwin' && !appIcon.isEmpty() ? { icon: appIcon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        sandbox: false
      }
    })

    if (vib) {
      try {
        if (process.platform === 'darwin') {
          win.setVibrancy(
            (typeof vib === 'string' ? vib : 'under-window') as Parameters<
              BrowserWindow['setVibrancy']
            >[0]
          )
        } else if (process.platform === 'win32') {
          ;(win as BrowserWindowWithExtendedVibrancy).setVibrancy(
            typeof vib === 'string' ? vib : 'acrylic'
          )
        }
      } catch {}
    }

    state.manage(win)

    const baseUrl = process.env['ELECTRON_RENDERER_URL']
    if (is.dev && baseUrl) {
      const url = options?.route ? `${baseUrl}#${options.route}` : baseUrl
      win.loadURL(url)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    win.on('closed', () => {
      this.children.delete(key)
    })

    this.children.set(key, win)
    this.applyZoomPersistence(win)
    return win
  }
}

export const windowService = new WindowService()
