import { createContext, useContext } from 'react'

export const WorkspaceContext = createContext<{ workspaceId: string } | undefined>(undefined)

export function WorkspaceProvider({
  workspaceId,
  children
}: {
  workspaceId: string
  children: React.ReactNode
}) {
  return <WorkspaceContext.Provider value={{ workspaceId }}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): { workspaceId: string } {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return ctx
}
