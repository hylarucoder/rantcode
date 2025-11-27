import { Routes, Route } from 'react-router'
import AppShell from '@/layout/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { ProjectsProvider } from '@/state/projects'
import { useCodexLogSubscription } from '@/state/codexLogs'
import SettingsPage from '@/settings/SettingsPage'
import { ProjectsPage } from '@/features/projects'
import { ProjectPage } from '@/features/workspace'
import NotFound from '@/components/NotFound'

export default function App() {
  // Subscribe once at the app root so Codex logs are collected
  // globally in memory for the current Electron session.
  useCodexLogSubscription()

  return (
    <ProjectsProvider>
      <Routes>
        {/* 全局设置 */}
        <Route path="/settings/*" element={<SettingsPage />} />

        {/* 主应用 */}
        <Route element={<AppShell />}>
          <Route index element={<ProjectsPage />} />
          <Route path="project/:projectId" element={<ProjectPage />} />
          {/* 全局 404 */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <Toaster richColors />
    </ProjectsProvider>
  )
}
