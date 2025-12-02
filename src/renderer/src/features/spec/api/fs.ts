import { orpc } from '@/lib/orpcQuery'

export type FsBase = 'repo' | 'agent-docs' | ''

export async function fetchFsTree(opts: { base?: FsBase; depth?: number; projectId?: string }) {
  return (await (
    orpc.fs.tree as {
      call: (o: { base?: FsBase; depth?: number; projectId?: string }) => Promise<unknown>
    }
  ).call(opts)) as unknown
}

export async function fetchFile(opts: { base?: FsBase; path: string; projectId?: string }) {
  return (await (
    orpc.fs.read as {
      call: (o: {
        base?: FsBase
        path: string
        projectId?: string
      }) => Promise<{ path: string; content: string }>
    }
  ).call(opts)) as { path: string; content: string }
}
