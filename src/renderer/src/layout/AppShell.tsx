import { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  FolderOpen,
  Moon,
  Plus,
  Sun,
  Trash2,
  Settings as SettingsIcon,
  MessageSquare
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
import { useProjects } from '@/app/providers'
import { useAppStore } from '@/app/state'
import { setRootDarkWithNoTransition } from '@/lib/theme'
import { useSfx } from '@/shared/hooks/useSfx'
import {
  useGeneralSettingsQuery,
  useSetGeneralSettingsMutation
} from '@/features/settings/api/generalHooks'
import { StatusBar } from './StatusBar'
import { GlobalChatPanel, useGlobalChatStore } from '@/features/global-chat'
import type { z } from 'zod'
import type { generalSettingsSchema } from '@shared/orpc/schemas'

type GeneralSettings = z.infer<typeof generalSettingsSchema>
type Theme = GeneralSettings['theme']

export default function AppShell() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId?: string }>()
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId)
  const { projects, removeProject, loading } = useProjects()
  const activeProject = projects.find((p) => p.id === (projectId ?? activeProjectId)) ?? null
  const hasProjects = projects.length > 0
  const { data: generalSettings } = useGeneralSettingsQuery()
  const setGeneralSettings = useSetGeneralSettingsMutation()
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  )
  const navigate = useNavigate()
  const { play: playSfx } = useSfx()

  // 全局对话面板
  const toggleGlobalChat = useGlobalChatStore((s) => s.toggle)
  const setGlobalChatProject = useGlobalChatStore((s) => s.setSelectedProjectId)

  // 全局快捷键：Cmd+/ (Mac) 或 Ctrl+/ (其他) 切换对话面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+/ 或 Ctrl+/
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        // 如果当前在项目页面，自动同步项目到全局对话
        if (projectId) {
          setGlobalChatProject(projectId)
        }
        toggleGlobalChat()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleGlobalChat, setGlobalChatProject, projectId])

  // 同步 URL 参数到 app store
  useEffect(() => {
    if (projectId && projectId !== activeProjectId) {
      setActiveProjectId(projectId)
    }
  }, [projectId, activeProjectId, setActiveProjectId])

  // 同步 electron-store 的 theme 设置到本地状态
  useEffect(() => {
    if (generalSettings?.theme) {
      const nextDark = generalSettings.theme === 'dark'
      setRootDarkWithNoTransition(nextDark)
      setIsDark(nextDark)
    }
  }, [generalSettings?.theme])

  // 如果当前选中的项目已不存在（被删除或列表还未包含），清空选择，避免卡在无效 id
  useEffect(() => {
    if (loading) return
    if (projectId && !projects.find((p) => p.id === projectId)) {
      navigate('/', { replace: true })
      setActiveProjectId(null)
    }
  }, [loading, projectId, projects, navigate, setActiveProjectId])

  const activeLabel = useMemo(() => {
    if (activeProject) return activeProject.name || activeProject.repoPath
    if (!hasProjects) return t('layout.noProjects')
    return t('layout.selectProject')
  }, [activeProject, hasProjects, t])

  const handleTitlebarDoubleClick = () => {
    const bridge = (
      window as unknown as {
        orpc?: (path: string[], input: unknown) => Promise<unknown>
      }
    ).orpc
    void bridge?.(['app', 'toggleMaximize'], undefined)
  }

  const handleSelectProject = (id: string) => {
    setActiveProjectId(id)
    navigate(`/project/${id}`)
  }

  const handleManageProjects = () => {
    setActiveProjectId(null)
    navigate('/')
  }

  const handleRemoveCurrentProject = async () => {
    if (!activeProject) return
    const ok = window.confirm(
      t('projects.remove.confirm', { name: activeProject.name || activeProject.repoPath })
    )
    if (!ok) return
    await removeProject(activeProject.id)
    setActiveProjectId(null)
    navigate('/')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Custom titlebar area (draggable except interactive controls) */}
      <div
        className="titlebar flex h-10 shrink-0 items-center gap-4 border-b border-border/80 bg-background/95 px-4"
        onDoubleClick={handleTitlebarDoubleClick}
      >
        {/* Spacer for macOS traffic lights */}
        <div className="h-full w-20" />
        <div className="flex flex-1 items-center gap-3">
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
                {t('layout.projects')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {projects.map((project) => {
                const isActive = project.id === (projectId ?? activeProjectId)
                return (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => handleSelectProject(project.id)}
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
                      <span className="ml-2 text-[10px] uppercase text-primary">
                        {t('common.status.active')}
                      </span>
                    )}
                  </DropdownMenuItem>
                )
              })}
              {!projects.length && (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  {t('layout.noProjectsYet')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex items-center gap-2 text-xs"
                onClick={handleManageProjects}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('layout.addOrManageProjects')}
              </DropdownMenuItem>
              {activeProject && (
                <DropdownMenuItem
                  variant="destructive"
                  className="flex items-center gap-2 text-xs"
                  onClick={(e) => {
                    e.preventDefault()
                    void handleRemoveCurrentProject()
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('layout.removeCurrentProject')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center gap-1.5">
            {/* 全局对话按钮 */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground hover:bg-accent/40"
              onPointerDown={() => playSfx('click')}
              onClick={() => {
                if (projectId) {
                  setGlobalChatProject(projectId)
                }
                toggleGlobalChat()
              }}
              title={t('layout.openChat', '对话 (⌘/)')}
            >
              <MessageSquare className="h-4 w-4" />
              <span className="sr-only">{t('layout.openChat', '对话')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground hover:bg-accent/40"
              onPointerDown={() => playSfx('click')}
              onClick={() => navigate('/settings/general')}
            >
              <SettingsIcon className="h-4 w-4" />
              <span className="sr-only">{t('layout.openSettings')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground hover:bg-accent/40"
              onClick={() => {
                const next = !isDark
                const nextTheme: Theme = next ? 'dark' : 'light'
                setRootDarkWithNoTransition(next)
                setIsDark(next)
                if (generalSettings) {
                  setGeneralSettings.mutate({ ...generalSettings, theme: nextTheme })
                }
              }}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="sr-only">{t('layout.toggleTheme')}</span>
            </Button>
          </div>
        </div>
      </div>
      {/* 主内容区域和聊天面板（挤压式布局） */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-hidden">
          <Outlet />
        </div>
        {/* 全局对话面板 - 从右侧挤压 */}
        <GlobalChatPanel />
      </div>
      {/* 底部状态栏 */}
      <StatusBar />
    </div>
  )
}
