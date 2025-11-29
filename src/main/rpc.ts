import { app, BrowserWindow, dialog } from 'electron'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { loggerService } from './services/loggerService'
import { getProjectsStorePath as getProjectsStorePathFromPaths } from './paths'
import type {
  FsTreeNode,
  HealthResponse,
  FsFile,
  ProjectInfo,
  CreateProjectInput,
  UpdateProjectInput
} from '../shared/types/webui'
import type { z } from 'zod'
import type {
  sessionSchema,
  messageSchema,
  createSessionInputSchema,
  updateSessionInputSchema,
  deleteSessionInputSchema,
  appendMessagesInputSchema,
  updateMessageInputSchema,
  listSessionsInputSchema,
  getSessionInputSchema
} from '../shared/orpc/schemas'

// Session types
export type Session = z.infer<typeof sessionSchema>
export type Message = z.infer<typeof messageSchema>
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>
export type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>
export type DeleteSessionInput = z.infer<typeof deleteSessionInputSchema>
export type AppendMessagesInput = z.infer<typeof appendMessagesInputSchema>
export type UpdateMessageInput = z.infer<typeof updateMessageInputSchema>
export type ListSessionsInput = z.infer<typeof listSessionsInputSchema>
export type GetSessionInput = z.infer<typeof getSessionInputSchema>

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
  return getProjectsStorePathFromPaths()
}

async function readProjects(): Promise<ProjectRecord[]> {
  const file = getProjectsStorePath()
  const t0 = Date.now()
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as ProjectRecord[]
    const dt = Date.now() - t0
    if (!Array.isArray(parsed)) {
      projectStoreLog.warn('projects store invalid payload', {
        file,
        durationMs: dt,
        size: raw.length
      })
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
      projectStoreLog.debug('projects store missing, initializing empty list', {
        file,
        durationMs: dt
      })
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

export async function resolveProjectRoot(projectId?: string): Promise<string> {
  if (projectId) {
    const existing = await resolveProjectById(projectId)
    if (!existing) {
      throw new Error(`Workspace ${projectId} not found`)
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
  projectId?: string
): Promise<string> {
  const root = path.resolve(await resolveProjectRoot(projectId))
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
    base?: 'repo' | 'docs' | 'vibe-spec' | ''
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
    base?: 'repo' | 'docs' | 'vibe-spec' | ''
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

// Git status/diff types
export interface GitFileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'unmerged'
  staged: boolean
}

export interface GitStatus {
  branch?: string
  ahead?: number
  behind?: number
  files: GitFileStatus[]
}

export interface GitDiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string
}

export interface GitDiffFile {
  path: string
  oldPath?: string
  additions: number
  deletions: number
  hunks: GitDiffHunk[]
}

export interface GitDiff {
  files: GitDiffFile[]
}

export class GitService {
  async status(opts: { projectId: string }): Promise<GitStatus> {
    const root = await resolveProjectRoot(opts.projectId)

    // Get branch info
    const branch = await this.runGit(root, ['branch', '--show-current'])

    // Get ahead/behind info
    let ahead = 0
    let behind = 0
    try {
      const tracking = await this.runGit(root, [
        'rev-list',
        '--left-right',
        '--count',
        '@{u}...HEAD'
      ])
      const [behindStr, aheadStr] = tracking.split('\t').map((s) => s.trim())
      behind = parseInt(behindStr || '0', 10)
      ahead = parseInt(aheadStr || '0', 10)
    } catch {
      // No upstream or error - ignore
    }

    // Get file statuses
    const porcelain = await this.runGit(root, ['status', '--porcelain', '-uall'])
    const files: GitFileStatus[] = []

    for (const line of porcelain.split('\n')) {
      if (!line.trim()) continue
      const indexStatus = line[0]
      const worktreeStatus = line[1]
      const filePath = line.slice(3).trim()

      // Handle renames (path contains ' -> ')
      const actualPath = filePath.includes(' -> ') ? filePath.split(' -> ')[1] : filePath

      const status = this.parseStatus(indexStatus, worktreeStatus)
      const staged = indexStatus !== ' ' && indexStatus !== '?'

      if (status) {
        files.push({ path: actualPath, status, staged })
      }
    }

    return {
      branch: branch.trim() || undefined,
      ahead: ahead || undefined,
      behind: behind || undefined,
      files
    }
  }

  async diff(opts: { projectId: string; path?: string; staged?: boolean }): Promise<GitDiff> {
    const root = await resolveProjectRoot(opts.projectId)

    const args = ['diff', '--unified=3']
    if (opts.staged) {
      args.push('--staged')
    }
    if (opts.path) {
      args.push('--', opts.path)
    }

    const output = await this.runGit(root, args)
    return this.parseDiff(output)
  }

  private parseStatus(index: string, worktree: string): GitFileStatus['status'] | null {
    // Untracked
    if (index === '?' && worktree === '?') return 'untracked'
    // Added
    if (index === 'A') return 'added'
    // Deleted
    if (index === 'D' || worktree === 'D') return 'deleted'
    // Renamed
    if (index === 'R') return 'renamed'
    // Copied
    if (index === 'C') return 'copied'
    // Unmerged
    if (index === 'U' || worktree === 'U') return 'unmerged'
    // Modified
    if (index === 'M' || worktree === 'M') return 'modified'
    return null
  }

  private parseDiff(output: string): GitDiff {
    const files: GitDiffFile[] = []
    const fileSections = output.split(/^diff --git /m).filter(Boolean)

    for (const section of fileSections) {
      const lines = section.split('\n')
      const headerLine = lines[0] || ''

      // Parse file paths from header
      const pathMatch = headerLine.match(/a\/(.+?) b\/(.+)/)
      if (!pathMatch) continue

      const oldPath = pathMatch[1]
      const newPath = pathMatch[2]

      let additions = 0
      let deletions = 0
      const hunks: GitDiffHunk[] = []

      // Find hunks
      let hunkContent = ''
      let currentHunk: Partial<GitDiffHunk> | null = null

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]

        // Hunk header
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
        if (hunkMatch) {
          // Save previous hunk
          if (currentHunk) {
            hunks.push({
              oldStart: currentHunk.oldStart!,
              oldLines: currentHunk.oldLines!,
              newStart: currentHunk.newStart!,
              newLines: currentHunk.newLines!,
              content: hunkContent
            })
          }

          currentHunk = {
            oldStart: parseInt(hunkMatch[1], 10),
            oldLines: parseInt(hunkMatch[2] || '1', 10),
            newStart: parseInt(hunkMatch[3], 10),
            newLines: parseInt(hunkMatch[4] || '1', 10)
          }
          hunkContent = line + '\n'
          continue
        }

        if (currentHunk) {
          hunkContent += line + '\n'
          if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++
          }
        }
      }

      // Save last hunk
      if (currentHunk) {
        hunks.push({
          oldStart: currentHunk.oldStart!,
          oldLines: currentHunk.oldLines!,
          newStart: currentHunk.newStart!,
          newLines: currentHunk.newLines!,
          content: hunkContent
        })
      }

      files.push({
        path: newPath,
        oldPath: oldPath !== newPath ? oldPath : undefined,
        additions,
        deletions,
        hunks
      })
    }

    return { files }
  }

  private runGit(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message))
          return
        }
        resolve(stdout)
      })
    })
  }
}

// Session Service moved to storage/FileSessionService.ts (file-based storage)
// SQLite implementation deprecated in favor of file storage for better performance with large logs.

// Legacy ipc-based RPC removed in favor of oRPC. Keep services as pure classes
// (SystemService, FsService, ProjectService, GitService) for reuse in oRPC bridge.
