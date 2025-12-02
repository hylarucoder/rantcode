import type { SpecDocMeta } from '../types'
import { orpc } from '@/lib/orpcQuery'

type FsBase = 'repo' | 'agent-docs' | ''

const DUMMY_API_BASE = 'https://rantcode.local'

type RendererFsApi = {
  tree(opts: { base?: FsBase; depth?: number; projectId?: string }): Promise<unknown>
  read(opts: {
    base?: FsBase
    path: string
    projectId?: string
  }): Promise<{ path: string; content: string }>
}

export function getFsApi(): RendererFsApi {
  return {
    tree: (opts) =>
      (
        orpc.fs.tree as {
          call: (o: { base?: FsBase; depth?: number; projectId?: string }) => Promise<unknown>
        }
      ).call(opts),
    read: (opts) =>
      (
        orpc.fs.read as {
          call: (o: {
            base?: FsBase
            path: string
            projectId?: string
          }) => Promise<{ path: string; content: string }>
        }
      ).call(opts)
  }
}

function toUrl(path: string): URL {
  try {
    return new URL(path, DUMMY_API_BASE)
  } catch {
    throw new Error(`Invalid API path: ${path}`)
  }
}

async function callFsTree<T>(url: URL): Promise<T> {
  const base = (url.searchParams.get('base') || 'repo') as FsBase
  const depthParam = Number(url.searchParams.get('depth') || '0')
  const depth = Number.isFinite(depthParam) && depthParam > 0 ? depthParam : undefined
  return (await getFsApi().tree({ base, depth })) as T
}

async function callSpecDoc<T>(url: URL): Promise<T> {
  const base = (url.searchParams.get('base') || 'repo') as FsBase
  const relPath = url.searchParams.get('path') || ''
  if (!relPath) {
    throw new Error('path is required')
  }
  const file = await getFsApi().read({ base, path: relPath })
  const meta: SpecDocMeta = {
    path: file.path,
    content: file.content,
    fields: {},
    errors: [],
    warnings: []
  }
  return meta as T
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const url = toUrl(path)
  const method = (opts.method || 'GET').toUpperCase()

  if (url.pathname === '/api/fs/tree' && method === 'GET') {
    return callFsTree<T>(url)
  }

  if (url.pathname === '/api/spec/doc' && method === 'GET') {
    return callSpecDoc<T>(url)
  }

  throw new Error(`API route ${method} ${url.pathname} has not been migrated to RPC yet.`)
}
