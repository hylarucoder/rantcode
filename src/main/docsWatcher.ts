import path from 'node:path'
import fs from 'node:fs/promises'
import chokidar, { type FSWatcher } from 'chokidar'
import type { WebContents } from 'electron'
import type { DocsWatcherEvent } from '../shared/types/webui'
import { resolveBaseDir } from './rpc'
import { notifyDocs } from './notifyBridge'

type ProjectKey = string

const DEFAULT_WORKSPACE_KEY = '__default__'

interface WatchEntry {
  watcher: FSWatcher
  baseDir: string
  projectId?: string
  subscribers: Map<number, number>
}

// IPC 请求类型已移除（改用 oRPC）；仅保留内部函数与类型。

const watchers = new Map<ProjectKey, WatchEntry>()
const contentsToProjects = new Map<number, Set<ProjectKey>>()

function toProjectKey(projectId?: string): ProjectKey {
  const trimmed = projectId?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_WORKSPACE_KEY
}

async function createWatcher(key: ProjectKey, projectId?: string): Promise<WatchEntry> {
  const baseDir = await resolveBaseDir('agent-docs', projectId)
  const stat = await fs.stat(baseDir).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error(`agent-docs directory not found at ${baseDir}`)
  }

  const watcher = chokidar.watch(baseDir, {
    ignoreInitial: true,
    persistent: true,
    depth: 12,
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
    subscribers: new Map()
  }

  const emitFileEvent: (
    changeType: 'add' | 'change' | 'unlink',
    filePath: string
  ) => Promise<void> = async (changeType: 'add' | 'change' | 'unlink', filePath: string) => {
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
      content = await fs.readFile(filePath, 'utf8').catch(() => undefined)
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

  watcher.on('add', (filePath: string) => {
    emitFileEvent('add', filePath).catch((error) => {
      broadcast(key, {
        projectId: entry.projectId,
        kind: 'error',
        message: error?.message || 'Failed to handle docs add event'
      })
    })
  })

  watcher.on('change', (filePath: string) => {
    emitFileEvent('change', filePath).catch((error) => {
      broadcast(key, {
        projectId: entry.projectId,
        kind: 'error',
        message: error?.message || 'Failed to handle docs change event'
      })
    })
  })

  watcher.on('unlink', (filePath: string) => {
    const rel = path.relative(entry.baseDir, filePath)
    if (!rel || rel.startsWith('..')) {
      return
    }
    broadcast(key, {
      projectId: entry.projectId,
      kind: 'file',
      changeType: 'unlink',
      path: rel.split(path.sep).join('/'),
      updatedAt: Date.now()
    })
  })

  watcher.on('ready', () => {
    broadcast(key, {
      projectId: entry.projectId,
      kind: 'ready',
      root: entry.baseDir
    })
  })

  watcher.on('error', (error) => {
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
  if (existing) return existing
  return createWatcher(key, projectId)
}

function broadcast(key: ProjectKey, payload: DocsWatcherEvent): void {
  const entry = watchers.get(key)
  if (!entry) return
  for (const [contentsId] of entry.subscribers) {
    notifyDocs(contentsId, payload)
  }
  if (entry.subscribers.size === 0) {
    void stopWatcher(key)
  }
}

async function stopWatcher(key: ProjectKey): Promise<void> {
  const entry = watchers.get(key)
  if (!entry) return
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

  if (entry.subscribers.size === 0) {
    void stopWatcher(key)
  }
}

function cleanupContents(contentsId: number): void {
  const keys = contentsToProjects.get(contentsId)
  if (!keys) return
  for (const key of keys) {
    const entry = watchers.get(key)
    entry?.subscribers.delete(contentsId)
    if (entry && entry.subscribers.size === 0) {
      void stopWatcher(key)
    }
  }
  contentsToProjects.delete(contentsId)
}

// 旧的 IPC 订阅桥已移除；请通过 oRPC: docs.subscribe / docs.unsubscribe 使用。
