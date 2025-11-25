import { useMutation, useQuery } from '@tanstack/react-query'
import { orpc } from '@/lib/orpcQuery'
import type { ProjectInfo } from '@/types'

function requireProjectsNamespace() {
  type ProjectsNamespace = {
    list: { call: () => Promise<ProjectInfo[]> }
    add: { call: (input: { repoPath: string; name?: string }) => Promise<ProjectInfo> }
    remove: { call: (input: { id: string }) => Promise<{ ok: boolean }> }
    pickRepoPath: { call: () => Promise<{ path: string } | null> }
  }
  const projects = (orpc as { projects?: ProjectsNamespace }).projects
  if (!projects) {
    console.error('[oRPC] orpc.projects is undefined. orpc:', orpc)
    throw new Error('oRPC projects namespace is unavailable')
  }
  return projects
}

export function useProjectsQuery() {
  return useQuery({
    queryKey: ['projects', 'list'],
    queryFn: async () => {
      const t0 = performance.now()
      const { list } = requireProjectsNamespace()
      const result = await list.call()
      const dt = performance.now() - t0
      console.log(`[oRPC] projects.list call completed in ${dt.toFixed(2)}ms`)
      return result
    }
  })
}

export function useAddProjectMutation() {
  return useMutation({
    mutationFn: async (input: { repoPath: string; name?: string }) => {
      const { add } = requireProjectsNamespace()
      return await add.call(input)
    }
  })
}

export function useRemoveProjectMutation() {
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      const { remove } = requireProjectsNamespace()
      return await remove.call(input)
    }
  })
}

export async function pickRepoPath(): Promise<string | null> {
  const api = (window as unknown as {
    api?: { projects?: { pickRepoPath: () => Promise<{ path: string } | null> } }
  }).api
  const bridge = api?.projects
  if (!bridge?.pickRepoPath) {
    throw new Error('projects bridge is unavailable')
  }
  const result = await bridge.pickRepoPath()
  return result?.path ?? null
}
