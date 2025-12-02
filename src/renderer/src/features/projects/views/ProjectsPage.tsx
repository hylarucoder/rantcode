import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useProjects } from '@/state/projects'
import type { ProjectInfo } from '@/types'

export default function ProjectsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projects, loading, addProject, removeProject, pickRepoPath } = useProjects()
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [picking, setPicking] = useState(false)
  const [name, setName] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [repoPathError, setRepoPathError] = useState<string | null>(null)
  const isEmptyStateLoading = loading && projects.length === 0
  const prevLoading = useRef<{ loading: boolean; count: number }>({
    loading,
    count: projects.length
  })

  useEffect(() => {
    const previous = prevLoading.current
    if (previous.loading !== loading || previous.count !== projects.length) {
      console.log('[ProjectsPage] loading state changed', {
        previous,
        next: { loading, count: projects.length }
      })
      prevLoading.current = { loading, count: projects.length }
    }
  }, [loading, projects.length])

  const handleAdd = async () => {
    const trimmedRepoPath = repoPath.trim()
    const trimmedName = name.trim()
    if (!trimmedRepoPath) {
      setRepoPathError(t('projects.add.pathError'))
      return
    }
    setRepoPathError(null)

    try {
      setSubmitting(true)
      const project = await addProject({
        name: trimmedName || undefined,
        repoPath: trimmedRepoPath
      })
      toast.success(`Added ${project.name || project.repoPath}`)
      setModalOpen(false)
      setName('')
      setRepoPath('')
      navigate(`/project/${project.id}`)
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : t('projects.errors.addFailed')
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePick = async () => {
    setPicking(true)
    try {
      const path = await pickRepoPath()
      if (path) {
        setRepoPath(path)
        setRepoPathError(null)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('projects.errors.selectFolderFailed')
      toast.error(msg)
    } finally {
      setPicking(false)
    }
  }

  const openProject = (project: ProjectInfo) => {
    navigate(`/project/${project.id}`)
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-start px-6 pt-12">
      <div className="w-full max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('projects.emptyHint')}</p>
          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <Button
              size="default"
              className="inline-flex items-center gap-2"
              onClick={() => setModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t('projects.add.button')}
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('projects.add.title')}</DialogTitle>
                <DialogDescription className="sr-only">
                  {t('projects.add.description')}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    {t('projects.add.name')}
                  </label>
                  <Input
                    placeholder={t('projects.add.namePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t('projects.add.nameHint')}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    {t('projects.add.path')}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder={t('projects.add.pathPlaceholder')}
                      value={repoPath}
                      onChange={(e) => setRepoPath(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      type="button"
                      disabled={picking}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handlePick}
                    >
                      {picking ? t('common.button.browsing') : t('common.button.browse')}
                    </Button>
                  </div>
                  {repoPathError && <p className="text-xs text-red-500">{repoPathError}</p>}
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                >
                  {t('common.button.cancel')}
                </Button>
                <Button type="button" onClick={handleAdd} disabled={submitting}>
                  {submitting ? t('common.status.adding') : t('common.button.add')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {projects.length === 0 ? (
          <Card
            className="flex flex-col items-center justify-center border-dashed py-6"
            aria-busy={isEmptyStateLoading}
          >
            <p className="mb-3 text-sm text-muted-foreground">
              {isEmptyStateLoading ? t('projects.loadingProjects') : t('projects.empty')}
            </p>
            <Button
              type="button"
              onClick={() => {
                setModalOpen(true)
              }}
            >
              {t('projects.add.firstProject')}
            </Button>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-sm transition-colors hover:bg-accent/40"
                onClick={() => openProject(project)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium text-foreground">
                      {project.name || project.repoPath}
                    </span>
                    <span className="truncate text-xs font-mono text-muted-foreground">
                      {project.repoPath}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      openProject(project)
                    }}
                  >
                    {t('common.button.open')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={async (e) => {
                      e.stopPropagation()
                      const ok = window.confirm(
                        t('projects.remove.confirm', { name: project.name || project.repoPath })
                      )
                      if (!ok) return
                      try {
                        await removeProject(project.id)
                        toast.success(t('projects.remove.success'))
                      } catch (error) {
                        const msg =
                          error instanceof Error ? error.message : t('projects.errors.removeFailed')
                        toast.error(msg)
                      }
                    }}
                  >
                    {t('common.button.remove')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
