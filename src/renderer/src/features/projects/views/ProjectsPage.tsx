import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
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
      setRepoPathError('Enter an absolute path to your repository')
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
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to add project'
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
      const msg = err instanceof Error ? err.message : 'Failed to select folder'
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
          <p className="text-sm text-muted-foreground">
            Select an existing workspace or add a new local repository to start working.
          </p>
          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <Button
              size="default"
              className="inline-flex items-center gap-2"
              onClick={() => setModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              New Project
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Project</DialogTitle>
                <DialogDescription className="sr-only">
                  Create a new project by selecting repository path
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Name</label>
                  <Input
                    placeholder="My repo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Optional display name.</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Repository Path</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="/Users/me/Projects/my-repo"
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
                      {picking ? 'Picking…' : 'Browse…'}
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
                  Cancel
                </Button>
                <Button type="button" onClick={handleAdd} disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add'}
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
              {isEmptyStateLoading ? 'Loading projects…' : 'No projects yet.'}
            </p>
            <Button
              type="button"
              onClick={() => {
                setModalOpen(true)
              }}
            >
              Add your first project
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
                    Open
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={async (e) => {
                      e.stopPropagation()
                      const ok = window.confirm(
                        `Remove ${project.name || project.repoPath} from rantcode? Files stay on disk.`
                      )
                      if (!ok) return
                      try {
                        await removeProject(project.id)
                        toast.success('Project removed')
                      } catch (error) {
                        const msg =
                          error instanceof Error ? error.message : 'Failed to remove project'
                        toast.error(msg)
                      }
                    }}
                  >
                    Remove
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
