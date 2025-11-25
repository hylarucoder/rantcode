import AppShell from '@/layout/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { ProjectsProvider } from '@/state/projects'
import { useCodexLogSubscription } from '@/state/codexLogs'

export default function App() {
  // Subscribe once at the app root so Codex logs are collected
  // globally in memory for the current Electron session.
  useCodexLogSubscription()

  return (
    <ProjectsProvider>
      <AppShell />
      <Toaster richColors />
    </ProjectsProvider>
  )
}
