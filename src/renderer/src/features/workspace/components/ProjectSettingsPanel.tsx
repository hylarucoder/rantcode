import { Settings, FolderOpen, GitBranch, Clock, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ProjectInfo } from '@/types'

interface ProjectSettingsPanelProps {
  project: ProjectInfo
  onRemoveProject?: () => void
}

export function ProjectSettingsPanel({ project, onRemoveProject }: ProjectSettingsPanelProps) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3 border-b border-border/50 pb-4">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">项目设置</h1>
      </div>

      <Card className="flex flex-col gap-5 border-border/50 p-5">
        <h2 className="text-sm font-medium text-foreground">基本信息</h2>
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <FolderOpen className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-muted-foreground">项目名称</div>
              <div className="mt-1 text-sm">{project.name || '未命名项目'}</div>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <GitBranch className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-muted-foreground">仓库路径</div>
              <div className="mt-1 break-all font-mono text-sm text-foreground/80">
                {project.repoPath}
              </div>
            </div>
          </div>

          {project.createdAt && (
            <div className="flex items-start gap-4">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-muted-foreground">创建时间</div>
                <div className="mt-1 text-sm">
                  {new Date(project.createdAt).toLocaleString('zh-CN')}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-4 border-destructive/30 bg-destructive/5 p-5">
        <h2 className="text-sm font-medium text-destructive">危险操作</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">从列表中移除项目</div>
            <p className="mt-1 text-xs text-muted-foreground">
              移除后文件仍保留在磁盘上，不会删除。
            </p>
          </div>
          <Button variant="destructive" size="sm" className="shrink-0 gap-2" onClick={onRemoveProject}>
            <Trash2 className="h-4 w-4" />
            移除项目
          </Button>
        </div>
      </Card>
    </div>
  )
}

