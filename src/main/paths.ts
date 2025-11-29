/**
 * 统一的配置路径管理
 *
 * 所有配置文件统一存放在 ~/.rantcode/ 目录下
 * 开发环境使用 ~/.rantcode-dev/ 避免污染正式数据
 */
import * as path from 'node:path'
import * as os from 'node:os'
import { app } from 'electron'

/**
 * 获取 rantcode 配置根目录
 *
 * - 生产环境: ~/.rantcode/
 * - 开发环境: ~/.rantcode-dev/
 */
export function getConfigRoot(): string {
  const home = os.homedir()
  const isDev = !app.isPackaged || process.env.NODE_ENV !== 'production'
  return path.join(home, isDev ? '.rantcode-dev' : '.rantcode')
}

/**
 * 获取数据库文件路径
 */
export function getDbPath(): string {
  return path.join(getConfigRoot(), 'rantcode.db')
}

/**
 * 获取日志目录路径
 */
export function getLogsPath(): string {
  return path.join(getConfigRoot(), 'logs')
}

/**
 * 获取设置文件路径
 */
export function getSettingsPath(filename: string): string {
  return path.join(getConfigRoot(), filename)
}

/**
 * 获取 sessions 存储目录（用于迁移）
 */
export function getSessionsDir(): string {
  return path.join(getConfigRoot(), 'sessions')
}

/**
 * 获取项目列表文件路径
 */
export function getProjectsStorePath(): string {
  return path.join(getConfigRoot(), 'projects.json')
}

/**
 * 获取窗口状态文件路径
 */
export function getWindowStatePath(): string {
  return path.join(getConfigRoot(), 'main-window.json')
}

/**
 * 获取 Electron 原生 userData 路径（用于 Chromium 内部数据）
 *
 * 注意：某些 Electron/Chromium 内部数据（如 cookies、cache）
 * 仍然使用原生 userData 路径，这里返回原始路径供参考
 */
export function getElectronUserData(): string {
  return app.getPath('userData')
}
