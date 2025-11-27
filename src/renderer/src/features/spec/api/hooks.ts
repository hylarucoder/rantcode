import { useQuery } from '@tanstack/react-query'
import { orpc } from '@/lib/orpcQuery'
import type { FsBase } from './fs'

export function useFsTreeQuery(opts: {
  base?: FsBase
  depth?: number
  projectId?: string
  enabled?: boolean
}) {
  const { enabled = true, ...input } = opts || {}
  const options = orpc.fs.tree.queryOptions({ input })
  return useQuery({ ...options, enabled })
}

export function useFsFileQuery(opts: {
  base?: FsBase
  path: string
  projectId?: string
  enabled?: boolean
}) {
  const { enabled = true, ...input } = opts || {}
  const options = orpc.fs.read.queryOptions({ input })
  return useQuery({ ...options, enabled })
}
