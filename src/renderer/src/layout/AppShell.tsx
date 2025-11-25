import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  FolderOpen,
  Moon,
  Plus,
  Sun,
  Trash2,
  Settings as SettingsIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useProjects } from '@/state/projects'
import { WorkspacePage } from '@/features/workspace'
import { ProjectsPage } from '@/features/projects'
import { useAppStore } from '@/state/app'
import SettingsPage from '@/settings/SettingsPage'
import { setRootDarkWithNoTransition } from '@/lib/theme'
import { useSfx } from '@/hooks/useSfx'

export default function AppShell() {
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId)
  const { projects, removeProject, loading } = useProjects()
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const hasProjects = projects.length > 0
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { play: playSfx } = useSfx()

  // 如果当前选中的项目已不存在（被删除或列表还未包含），清空选择，避免卡在无效 id
  useEffect(() => {
    if (loading) return
    if (activeProjectId && !activeProject) {
      setActiveProjectId(null)
    }
  }, [loading, activeProjectId, activeProject, setActiveProjectId])

  const activeLabel = useMemo(() => {
    if (activeProject) return activeProject.name || activeProject.repoPath
    if (!hasProjects) return 'No projects'
    return 'Select project'
  }, [activeProject, hasProjects])

  const handleTitlebarDoubleClick = () => {
    const bridge = (
      window as unknown as {
        orpc?: (path: string[], input: unknown) => Promise<unknown>
      }
    ).orpc
    void bridge?.(['app', 'toggleMaximize'], undefined)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Custom titlebar area (draggable except interactive controls) */}
      <div
        className="titlebar flex h-10 flex-shrink-0 items-center gap-4 border-b border-border/80 bg-background/95 px-4"
        onDoubleClick={handleTitlebarDoubleClick}
      >
        {/* Spacer for macOS traffic lights */}
        <div className="h-full w-20" />
        <div className="no-drag flex flex-1 items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="inline-flex h-7 items-center gap-2 px-2 text-xs text-muted-foreground hover:bg-accent/40"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="max-w-[260px] truncate text-sm font-medium text-foreground">
                  {activeLabel}
                </span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[260px]">
              <DropdownMenuLabel className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                Projects
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {projects.map((project) => {
                const isActive = project.id === activeProjectId
                return (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => setActiveProjectId(project.id)}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {project.name || project.repoPath}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {project.repoPath}
                      </span>
                    </div>
                    {isActive && (
                      <span className="ml-2 text-[10px] uppercase text-primary">Active</span>
                    )}
                  </DropdownMenuItem>
                )
              })}
              {!projects.length && (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  No projects yet
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex items-center gap-2 text-xs"
                onClick={() => setActiveProjectId(null)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add or manage projects…
              </DropdownMenuItem>
              {activeProject && (
                <DropdownMenuItem
                  variant="destructive"
                  className="flex items-center gap-2 text-xs"
                  onClick={async (e) => {
                    e.preventDefault()
                    const ok = window.confirm(
                      `Remove ${activeProject.name || activeProject.repoPath} from rantcode? Files stay on disk.`
                    )
                    if (!ok) return
                    await removeProject(activeProject.id)
                    setActiveProjectId(null)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove current project
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground hover:bg-accent/40"
              onPointerDown={() => playSfx('click')}
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon className="h-4 w-4" />
              <span className="sr-only">Open settings</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground hover:bg-accent/40"
              onClick={() => {
                const next = !isDark
                setRootDarkWithNoTransition(next)
                setIsDark(next)
                localStorage.setItem('theme', next ? 'dark' : 'light')
              }}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="sr-only">Toggle theme</span>
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {settingsOpen ? (
          <SettingsPage onClose={() => setSettingsOpen(false)} />
        ) : activeProject ? (
          <WorkspacePage project={activeProject} />
        ) : (
          <ProjectsPage onOpenProject={(project) => setActiveProjectId(project.id)} />
        )}
      </div>
    </div>
  )
}
