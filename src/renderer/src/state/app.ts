import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type AppState = {
  activeProjectId: string | null
  setActiveProjectId: (id: string | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeProjectId: null,
      setActiveProjectId: (id) => set({ activeProjectId: id })
    }),
    {
      name: 'rantcode.app',
      version: 1,
      storage: createJSONStorage(() => localStorage)
    }
  )
)
