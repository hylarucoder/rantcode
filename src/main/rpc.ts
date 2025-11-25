import { app, BrowserWindow, dialog } from 'electron'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { loggerService } from './services/loggerService'
import type {
  FsTreeNode,
  HealthResponse,
  FsFile,
  ProjectInfo,
  CreateProjectInput,
  UpdateProjectInput
} from '../shared/types/webui'

export class SystemService {
  async health(): Promise<HealthResponse> {
    return { status: 'ok' }
  }

  async version(): Promise<{ version: string }> {
    // Read the application version from Electron
    return { version: app.getVersion() }
  }
}

async function gitRoot(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', '--show-toplevel'], { cwd }, (err, stdout) => {
      if (err) {
        resolve(null)
        return
      }
      const out = stdout.toString().trim()
      resolve(out || null)
    })
  })
}

type ProjectRecord = ProjectInfo

const projectStoreLog = loggerService.child('projects.store')

function getProjectsStorePath(): string {
  const userData = app.getPath('userData')
  return path.join(userData, 'projects.json')
}

async function readProjects(): Promise<ProjectRecord[]> {
  const file = getProjectsStorePath()
  const t0 = Date.now()
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as ProjectRecord[]
    const dt = Date.now() - t0
    if (!Array.isArray(parsed)) {
      projectStoreLog.warn('projects store invalid payload', { file, durationMs: dt, size: raw.length })
      return []
    }
    projectStoreLog.debug('projects store loaded', {
      file,
      durationMs: dt,
      size: raw.length,
      records: parsed.length
    })
    return parsed
  } catch (err) {
    const dt = Date.now() - t0
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      projectStoreLog.debug('projects store missing, initializing empty list', { file, durationMs: dt })
      return []
    }
    projectStoreLog.error('failed to read projects store', {
      file,
      durationMs: dt,
      message: (err as { message?: string })?.message
    })
    throw err
  }
}

async function writeProjects(projects: ProjectRecord[]): Promise<void> {
  const file = getProjectsStorePath()
  const t0 = Date.now()
  const payload = JSON.stringify(projects, null, 2)
  try {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, payload, 'utf8')
    const dt = Date.now() - t0
    projectStoreLog.debug('projects store saved', {
      file,
      durationMs: dt,
      size: payload.length,
      records: projects.length
    })
  } catch (err) {
    const dt = Date.now() - t0
    projectStoreLog.error('failed to write projects store', {
      file,
      durationMs: dt,
      size: payload.length,
      records: projects.length,
      message: (err as { message?: string })?.message
    })
    throw err
  }
}

async function resolveProjectById(id: string): Promise<ProjectRecord | undefined> {
  const projects = await readProjects()
  return projects.find((p) => p.id === id)
}

function normalizeRepoPath(repoPath: string): string {
  return path.resolve(repoPath.trim())
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  const stat = await fs.stat(dirPath).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Directory not found: ${dirPath}`)
  }
}

export async function resolveWorkspaceRoot(workspaceId?: string): Promise<string> {
  if (workspaceId) {
    const existing = await resolveProjectById(workspaceId)
    if (!existing) {
      throw new Error(`Workspace ${workspaceId} not found`)
    }
    await ensureDirectoryExists(existing.repoPath)
    return normalizeRepoPath(existing.repoPath)
  }
  return resolveDefaultRepoRoot()
}

async function resolveDefaultRepoRoot(): Promise<string> {
  const envRoot = process.env.RANTCODE_REPO_ROOT?.trim()
  if (envRoot) return envRoot
  const cwd = process.cwd()
  const root = await gitRoot(cwd)
  if (root && root.trim() !== '') return root.trim()
  return cwd
}

export async function resolveBaseDir(
  baseKey: 'repo' | 'docs' | 'vibe-spec' | '' | undefined,
  workspaceId?: string
): Promise<string> {
  const root = path.resolve(await resolveWorkspaceRoot(workspaceId))
  const key = baseKey ?? 'repo'
  switch (key) {
    case 'repo':
    case '':
      return root
    case 'docs':
      return path.join(root, 'docs')
    case 'vibe-spec':
      return path.join(root, 'docs', 'spec')
    default:
      throw new Error('invalid base')
  }
}

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
    base?: 'repo' | 'docs' | 'vibe-spec' | ''
    depth?: number
    workspaceId?: string
  }): Promise<FsTreeNode> {
    const baseKey = opts?.base ?? 'repo'
    let depth = typeof opts?.depth === 'number' ? opts.depth : 2
    if (!depth || depth <= 0 || depth > 8) {
      depth = 2
    }
    const baseDir = await resolveBaseDir(baseKey, opts?.workspaceId)
    const stat = await fs.stat(baseDir).catch(() => null)
    if (!stat || !stat.isDirectory()) {
      throw new Error('base not found')
    }
    return buildTree(baseDir, baseDir, depth)
  }

  async read(opts: {
    base?: 'repo' | 'docs' | 'vibe-spec' | ''
    path: string
    workspaceId?: string
  }): Promise<FsFile> {
    if (!opts?.path) {
      throw new Error('path is required')
    }
    const baseDir = await resolveBaseDir(opts.base ?? 'repo', opts.workspaceId)
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
}

export class ProjectService {
  async list(): Promise<ProjectInfo[]> {
    const t0 = Date.now()
    const result = await readProjects()
    const dt = Date.now() - t0
    console.log(`[projects.list] completed in ${dt}ms, projects: ${result.length}`)
    return result
  }

  async add(input: CreateProjectInput): Promise<ProjectInfo> {
    if (!input?.repoPath) {
      throw new Error('repoPath is required')
    }
    const repoPath = normalizeRepoPath(input.repoPath)
    await ensureDirectoryExists(repoPath)
    const projects = await readProjects()
    const duplicate = projects.find((p) => normalizeRepoPath(p.repoPath) === repoPath)
    if (duplicate) {
      throw new Error('Project already exists')
    }
    const now = new Date().toISOString()
    const project: ProjectRecord = {
      id: randomUUID(),
      name: input.name?.trim() || path.basename(repoPath),
      repoPath,
      createdAt: now,
      updatedAt: now
    }
    projects.push(project)
    await writeProjects(projects)
    return project
  }

  async update(input: UpdateProjectInput): Promise<ProjectInfo> {
    if (!input?.id) {
      throw new Error('id is required')
    }
    const projects = await readProjects()
    const idx = projects.findIndex((p) => p.id === input.id)
    if (idx === -1) {
      throw new Error('Project not found')
    }
    const current = projects[idx]
    if (input.repoPath) {
      const repoPath = normalizeRepoPath(input.repoPath)
      await ensureDirectoryExists(repoPath)
      const duplicate = projects.find(
        (p) => p.id !== input.id && normalizeRepoPath(p.repoPath) === repoPath
      )
      if (duplicate) {
        throw new Error('Another project already uses this path')
      }
      current.repoPath = repoPath
    }
    if (typeof input.name === 'string') {
      const trimmed = input.name.trim()
      if (trimmed.length > 0) {
        current.name = trimmed
      }
    }
    current.updatedAt = new Date().toISOString()
    projects[idx] = current
    await writeProjects(projects)
    return current
  }

  async remove(opts: { id: string }): Promise<{ ok: boolean }> {
    if (!opts?.id) {
      throw new Error('id is required')
    }
    const projects = await readProjects()
    const filtered = projects.filter((p) => p.id !== opts.id)
    if (filtered.length === projects.length) {
      throw new Error('Project not found')
    }
    await writeProjects(filtered)
    return { ok: true }
  }

  async pickRepoPath(): Promise<{ path: string } | null> {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory']
        })
    if (result.canceled || !result.filePaths.length) {
      return null
    }
    return { path: normalizeRepoPath(result.filePaths[0]) }
  }
}

// Legacy ipc-based RPC removed in favor of oRPC. Keep services as pure classes
// (SystemService, FsService, ProjectService) for reuse in oRPC bridge.
