import { useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ProjectProvider } from '@/state/workspace'
import { useProjects } from '@/state/projects'
import { toast } from 'sonner'

// 子视图组件
import SessionsView from './SessionsView'

/**
 * ProjectPage - 项目工作区容器
 * 提供项目级别的上下文，内部使用 ActivityBar 切换视图
 */
export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { projects, loading } = useProjects()

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  )

  // 项目不存在时重定向到首页
  useEffect(() => {
    if (!loading && !project && projectId) {
      toast.error('项目不存在')
      navigate('/', { replace: true })
    }
  }, [loading, project, projectId, navigate])

  // 加载中显示占位
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (!project) {
    return null
  }

  return (
    <ProjectProvider projectId={project.id}>
      <SessionsView project={project} />
    </ProjectProvider>
  )
}
