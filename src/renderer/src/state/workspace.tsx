import { createContext, useContext } from 'react'

export const ProjectContext = createContext<{ projectId: string } | undefined>(undefined)

export function ProjectProvider({
  projectId,
  children
}: {
  projectId: string
  children: React.ReactNode
}) {
  return <ProjectContext.Provider value={{ projectId }}>{children}</ProjectContext.Provider>
}

export function useProject(): { projectId: string } {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new Error('useProject must be used within ProjectProvider')
  }
  return ctx
}
