import { BrowserWindow, dialog } from 'electron'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { loggerService } from './loggerService'
import { getProjectsStorePath as getProjectsStorePathFromPaths } from '../paths'
import { humanizeDuration } from '../../shared/utils/humanize'
import type { ProjectInfo, CreateProjectInput, UpdateProjectInput } from '../../shared/orpc/schemas'

type ProjectRecord = ProjectInfo

const projectStoreLog = loggerService.child('projects.store')

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
  baseKey: 'repo' | 'agent-docs' | '' | undefined,
  projectId?: string
): Promise<string> {
  const root = path.resolve(await resolveProjectRoot(projectId))
  const key = baseKey ?? 'repo'
  switch (key) {
    case 'repo':
    case '':
      return root
    case 'agent-docs':
      return path.join(root, 'agent-docs')
    default:
      throw new Error('invalid base')
  }
}

export class ProjectService {
  async list(): Promise<ProjectInfo[]> {
    const t0 = Date.now()
    const result = await readProjects()
    const dt = Date.now() - t0
    console.log(`[projects.list] completed in ${humanizeDuration(dt)}, projects: ${result.length}`)
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

