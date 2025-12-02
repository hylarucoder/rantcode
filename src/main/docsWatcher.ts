import path from 'node:path'
import fs from 'node:fs/promises'
import chokidar, { type FSWatcher } from 'chokidar'
import type { WebContents } from 'electron'
import type { DocsWatcherEvent } from '../shared/types/webui'
import { resolveBaseDir } from './rpc'
import { notifyDocs } from './notifyBridge'
import { loggerService } from './services/loggerService'

type ProjectKey = string

const DEFAULT_WORKSPACE_KEY = '__default__'

// ============ 性能优化配置 ============

/** 只监听这些文档类型的文件 */
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.json', '.yaml', '.yml', '.txt'])

/** 超过此大小的文件不内联 content（512KB） */
const MAX_INLINE_SIZE = 512 * 1024

/** 同一文件变更的 debounce 时间（ms） */
const DEBOUNCE_MS = 300

/** watcher 无订阅后延迟关闭的时间（ms），避免频繁创建/销毁 */
const WATCHER_TTL_MS = 30_000

const log = loggerService.child('docs-watcher')

// ============ 类型定义 ============

interface WatchEntry {
  watcher: FSWatcher
  baseDir: string
  projectId?: string
  subscribers: Map<number, number>
  /** debounce 定时器：filePath -> timeout */
  debounceTimers: Map<string, NodeJS.Timeout>
  /** TTL 关闭定时器 */
  ttlTimer?: NodeJS.Timeout
}

// IPC 请求类型已移除（改用 oRPC）；仅保留内部函数与类型。

const watchers = new Map<ProjectKey, WatchEntry>()
const contentsToProjects = new Map<number, Set<ProjectKey>>()

function toProjectKey(projectId?: string): ProjectKey {
  const trimmed = projectId?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_WORKSPACE_KEY
}

/**
 * 检查文件是否为文档类型
 */
function isDocFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return DOC_EXTENSIONS.has(ext)
}

async function createWatcher(key: ProjectKey, projectId?: string): Promise<WatchEntry> {
  const baseDir = await resolveBaseDir('agent-docs', projectId)
  const stat = await fs.stat(baseDir).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error(`agent-docs directory not found at ${baseDir}`)
  }

  log.info('watcher-creating', { key, baseDir })

  const watcher = chokidar.watch(baseDir, {
    ignoreInitial: true,
    persistent: true,
    depth: 6, // 从 12 降到 6，大多数 docs 目录不会这么深
    ignored: ['**/.DS_Store', '**/node_modules/**', '**/*.swp', '**/*.tmp', '**/~$*'],
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100
    }
  })

  const entry: WatchEntry = {
    watcher,
    baseDir,
    projectId,
    subscribers: new Map(),
    debounceTimers: new Map()
  }

  /**
   * 实际执行文件事件发送（经过 debounce 后调用）
   */
  const doEmitFileEvent = async (
    changeType: 'add' | 'change' | 'unlink',
    filePath: string
  ): Promise<void> => {
    const rel = path.relative(entry.baseDir, filePath)
    if (!rel || rel.startsWith('..')) {
      return
    }

    const normalized = rel.split(path.sep).join('/')
    let content: string | undefined

    if (changeType !== 'unlink') {
      const fileStat = await fs.stat(filePath).catch(() => null)
      if (!fileStat || !fileStat.isFile()) {
        return
      }

      // 大文件保护：超过阈值不内联 content
      if (fileStat.size <= MAX_INLINE_SIZE) {
        content = await fs.readFile(filePath, 'utf8').catch(() => undefined)
      } else {
        log.debug('large-file-skipped-inline', { filePath, size: fileStat.size })
      }
    }

    broadcast(key, {
      projectId: entry.projectId,
      kind: 'file',
      changeType,
      path: normalized,
      updatedAt: Date.now(),
      content
    })
  }

  /**
   * Debounce 包装：同一文件短时间内多次变更只发一次事件
   */
  const scheduleFileEvent = (changeType: 'add' | 'change' | 'unlink', filePath: string): void => {
    // 文件类型过滤：只处理文档文件
    if (!isDocFile(filePath)) {
      return
    }

    // 清除之前的 debounce 定时器
    const existingTimer = entry.debounceTimers.get(filePath)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // 设置新的 debounce 定时器
    const timer = setTimeout(() => {
      entry.debounceTimers.delete(filePath)
      doEmitFileEvent(changeType, filePath).catch((error) => {
        log.error('emit-file-event-failed', {
          changeType,
          filePath,
          error: error?.message
        })
        broadcast(key, {
          projectId: entry.projectId,
          kind: 'error',
          message: error?.message || `Failed to handle docs ${changeType} event`
        })
      })
    }, DEBOUNCE_MS)

    entry.debounceTimers.set(filePath, timer)
  }

  watcher.on('add', (filePath: string) => {
    scheduleFileEvent('add', filePath)
  })

  watcher.on('change', (filePath: string) => {
    scheduleFileEvent('change', filePath)
  })

  watcher.on('unlink', (filePath: string) => {
    // unlink 也需要文件类型过滤
    if (!isDocFile(filePath)) {
      return
    }

    const rel = path.relative(entry.baseDir, filePath)
    if (!rel || rel.startsWith('..')) {
      return
    }

    // unlink 不需要 debounce，直接发送
    broadcast(key, {
      projectId: entry.projectId,
      kind: 'file',
      changeType: 'unlink',
      path: rel.split(path.sep).join('/'),
      updatedAt: Date.now()
    })
  })

  watcher.on('ready', () => {
    log.info('watcher-ready', { key, baseDir })
    broadcast(key, {
      projectId: entry.projectId,
      kind: 'ready',
      root: entry.baseDir
    })
  })

  watcher.on('error', (error) => {
    log.error('watcher-error', { key, error: error?.message })
    broadcast(key, {
      projectId: entry.projectId,
      kind: 'error',
      message: error?.message || 'docs watcher error'
    })
  })

  watchers.set(key, entry)
  return entry
}

async function ensureWatcher(key: ProjectKey, projectId?: string): Promise<WatchEntry> {
  const existing = watchers.get(key)
  if (existing) {
    // 取消 TTL 定时器（有新订阅进来了）
    if (existing.ttlTimer) {
      clearTimeout(existing.ttlTimer)
      existing.ttlTimer = undefined
      log.debug('watcher-ttl-cancelled', { key })
    }
    return existing
  }
  return createWatcher(key, projectId)
}

function broadcast(key: ProjectKey, payload: DocsWatcherEvent): void {
  const entry = watchers.get(key)
  if (!entry) return
  for (const [contentsId] of entry.subscribers) {
    notifyDocs(contentsId, payload)
  }
  if (entry.subscribers.size === 0) {
    scheduleWatcherClose(key)
  }
}

/**
 * 延迟关闭 watcher（TTL 机制）
 * 避免用户频繁打开/关闭面板时反复创建销毁 watcher
 */
function scheduleWatcherClose(key: ProjectKey): void {
  const entry = watchers.get(key)
  if (!entry) return

  // 已有 TTL 定时器，不重复设置
  if (entry.ttlTimer) return

  log.debug('watcher-ttl-scheduled', { key, ttlMs: WATCHER_TTL_MS })

  entry.ttlTimer = setTimeout(() => {
    // 再次检查是否还是无订阅
    if (entry.subscribers.size === 0) {
      void doStopWatcher(key)
    }
  }, WATCHER_TTL_MS)
}

/**
 * 立即关闭 watcher（内部使用）
 */
async function doStopWatcher(key: ProjectKey): Promise<void> {
  const entry = watchers.get(key)
  if (!entry) return

  log.info('watcher-closing', { key })

  // 清理所有 debounce 定时器
  for (const timer of entry.debounceTimers.values()) {
    clearTimeout(timer)
  }
  entry.debounceTimers.clear()

  // 清理 TTL 定时器
  if (entry.ttlTimer) {
    clearTimeout(entry.ttlTimer)
  }

  watchers.delete(key)
  await entry.watcher.close().catch(() => undefined)
}

export async function addDocsSubscriber(
  projectId: string | undefined,
  contents: WebContents
): Promise<void> {
  const key = toProjectKey(projectId)
  const entry = await ensureWatcher(key, projectId)
  const currentCount = entry.subscribers.get(contents.id) ?? 0
  entry.subscribers.set(contents.id, currentCount + 1)

  if (!contentsToProjects.has(contents.id)) {
    contentsToProjects.set(contents.id, new Set())
    contents.once('destroyed', () => {
      cleanupContents(contents.id)
    })
  }

  contentsToProjects.get(contents.id)?.add(key)
}

export function removeDocsSubscriber(projectId: string | undefined, contentsId: number): void {
  const key = toProjectKey(projectId)
  const entry = watchers.get(key)
  if (!entry) return
  const currentCount = entry.subscribers.get(contentsId)
  if (!currentCount) return

  if (currentCount <= 1) {
    entry.subscribers.delete(contentsId)
    const mapping = contentsToProjects.get(contentsId)
    mapping?.delete(key)
    if (mapping && mapping.size === 0) {
      contentsToProjects.delete(contentsId)
    }
  } else {
    entry.subscribers.set(contentsId, currentCount - 1)
  }

  // 使用 TTL 机制延迟关闭，而不是立即关闭
  if (entry.subscribers.size === 0) {
    scheduleWatcherClose(key)
  }
}

function cleanupContents(contentsId: number): void {
  const keys = contentsToProjects.get(contentsId)
  if (!keys) return
  for (const key of keys) {
    const entry = watchers.get(key)
    entry?.subscribers.delete(contentsId)
    // 使用 TTL 机制延迟关闭
    if (entry && entry.subscribers.size === 0) {
      scheduleWatcherClose(key)
    }
  }
  contentsToProjects.delete(contentsId)
}

// 旧的 IPC 订阅桥已移除；请通过 oRPC: docs.subscribe / docs.unsubscribe 使用。
