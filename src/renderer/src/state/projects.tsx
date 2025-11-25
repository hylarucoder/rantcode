import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ProjectInfo } from '@/types'
import { useQueryClient } from '@tanstack/react-query'
import {
  useProjectsQuery,
  useAddProjectMutation,
  useRemoveProjectMutation,
  pickRepoPath as pickPath
} from '@/features/projects'

interface ProjectsContextValue {
  projects: ProjectInfo[]
  loading: boolean
  refreshProjects: () => Promise<void>
  addProject: (input: { repoPath: string; name?: string }) => Promise<ProjectInfo>
  removeProject: (id: string) => Promise<void>
  pickRepoPath: () => Promise<string | null>
}

const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined)

// All project operations go through oRPC endpoints

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  const query = useProjectsQuery()
  const projects = (query.data ?? []) as ProjectInfo[]
  const loading = !!query.isLoading

  const addMutation = useAddProjectMutation()
  const removeMutation = useRemoveProjectMutation()

  const refreshProjects = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['projects', 'list'] })
  }, [queryClient])

  const addProject = useCallback(
    async (input: { repoPath: string; name?: string }) => {
      const project = await addMutation.mutateAsync(input)
      await queryClient.invalidateQueries({ queryKey: ['projects', 'list'] })
      return project
    },
    [addMutation, queryClient]
  )

  const removeProject = useCallback(
    async (id: string) => {
      await removeMutation.mutateAsync({ id })
      await queryClient.invalidateQueries({ queryKey: ['projects', 'list'] })
    },
    [removeMutation, queryClient]
  )

  const pickRepoPath = useCallback(async () => pickPath(), [])

  const value = useMemo<ProjectsContextValue>(
    () => ({
      projects,
      loading,
      refreshProjects,
      addProject,
      removeProject,
      pickRepoPath
    }),
    [projects, loading, refreshProjects, addProject, removeProject, pickRepoPath]
  )

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext)
  if (!ctx) {
    throw new Error('useProjects must be used within ProjectsProvider')
  }
  return ctx
}
