import { orpc } from '@/lib/orpcQuery'

export type FsBase = 'repo' | 'docs' | 'vibe-spec' | ''

export async function fetchFsTree(opts: { base?: FsBase; depth?: number; workspaceId?: string }) {
  return (await (
    orpc.fs.tree as {
      call: (o: { base?: FsBase; depth?: number; workspaceId?: string }) => Promise<unknown>
    }
  ).call(opts)) as unknown
}

export async function fetchFile(opts: { base?: FsBase; path: string; workspaceId?: string }) {
  return (await (
    orpc.fs.read as {
      call: (o: {
        base?: FsBase
        path: string
        workspaceId?: string
      }) => Promise<{ path: string; content: string }>
    }
  ).call(opts)) as { path: string; content: string }
}
