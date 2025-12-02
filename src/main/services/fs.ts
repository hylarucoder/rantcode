import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'
import type { FsTreeNode, FsFile } from '../../shared/orpc/schemas'
import { resolveBaseDir } from './projects'

const IGNORED_DIRS = new Set<string>([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'target',
  'vendor',
  '.cache'
])

function toSlash(p: string): string {
  return p.split(path.sep).join('/')
}

function relSafe(rootDir: string, target: string): string {
  const rel = path.relative(path.resolve(rootDir), path.resolve(target))
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return toSlash(target)
  }
  return toSlash(rel)
}

function ensureWithinBase(baseDir: string, target: string): string {
  const normalizedBase = path.resolve(baseDir)
  const normalizedTarget = path.resolve(target)
  const rel = path.relative(normalizedBase, normalizedTarget)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('path escapes base')
  }
  return normalizedTarget
}

function resolvePathInBase(baseDir: string, relPath: string): string {
  const normalizedBase = path.resolve(baseDir)
  const sanitized = (relPath ?? '').replace(/^[/\\]+/g, '')
  const target = path.resolve(normalizedBase, sanitized)
  return ensureWithinBase(normalizedBase, target)
}

async function buildTree(rootDir: string, dir: string, depth: number): Promise<FsTreeNode> {
  const node: FsTreeNode = {
    path: relSafe(rootDir, dir),
    name: path.basename(dir),
    dir: true,
    children: []
  }
  if (depth <= 0) return node

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return node
  }

  const filtered = entries.filter((entry) => {
    if (entry.name.startsWith('.')) return false
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) return false
    return true
  })
  filtered.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) {
      return a.isDirectory() ? -1 : 1
    }
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  })

  for (const entry of filtered) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const child = await buildTree(rootDir, entryPath, depth - 1)
      node.children?.push(child)
    } else {
      node.children?.push({
        path: relSafe(rootDir, entryPath),
        name: entry.name,
        dir: false
      })
    }
  }

  return node
}

export class FsService {
  async tree(opts?: {
    base?: 'repo' | 'agent-docs' | ''
    depth?: number
    projectId?: string
  }): Promise<FsTreeNode> {
    const baseKey = opts?.base ?? 'repo'
    let depth = typeof opts?.depth === 'number' ? opts.depth : 2
    if (!depth || depth <= 0 || depth > 8) {
      depth = 2
    }
    const baseDir = await resolveBaseDir(baseKey, opts?.projectId)
    const stat = await fs.stat(baseDir).catch(() => null)
    if (!stat || !stat.isDirectory()) {
      throw new Error('base not found')
    }
    return buildTree(baseDir, baseDir, depth)
  }

  async read(opts: {
    base?: 'repo' | 'agent-docs' | ''
    path: string
    projectId?: string
  }): Promise<FsFile> {
    if (!opts?.path) {
      throw new Error('path is required')
    }
    const baseDir = await resolveBaseDir(opts.base ?? 'repo', opts.projectId)
    const absPath = resolvePathInBase(baseDir, opts.path)
    const stat = await fs.stat(absPath).catch(() => null)
    if (!stat || !stat.isFile()) {
      throw new Error('file not found')
    }
    const content = await fs.readFile(absPath, 'utf8')
    return {
      path: relSafe(baseDir, absPath),
      content
    }
  }

  async write(opts: {
    base?: 'repo' | 'agent-docs' | ''
    path: string
    content: string
    projectId?: string
  }): Promise<{ ok: boolean }> {
    if (!opts?.path) {
      throw new Error('path is required')
    }
    if (typeof opts.content !== 'string') {
      throw new Error('content is required')
    }
    const baseDir = await resolveBaseDir(opts.base ?? 'repo', opts.projectId)
    const absPath = resolvePathInBase(baseDir, opts.path)
    // 确保父目录存在
    const dir = path.dirname(absPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(absPath, opts.content, 'utf8')
    return { ok: true }
  }
}

