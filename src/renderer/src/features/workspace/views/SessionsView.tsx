import { useNavigate } from 'react-router'
import type { ProjectInfo } from '@/types'
import { WorkspaceLayout } from '@/features/workspace/views/WorkspaceLayout'
import { usePreviewDocument } from '@/features/preview'
import { useProjectPreview } from '@/features/workspace/state/hooks/useProjectPreview'
import { useProjects } from '@/state/projects'

interface SessionsViewProps {
  project: ProjectInfo
}

/**
 * SessionsView - 项目工作区视图
 *
 * 注：虽然名字叫 SessionsView，但聊天功能已移至全局对话面板。
 * 这里主要处理文档预览相关的逻辑。
 *
 * TODO: 考虑重命名为 BrowseView 或 WorkspaceView
 */
export default function SessionsView({ project }: SessionsViewProps) {
  const navigate = useNavigate()
  const { removeProject } = useProjects()

  const projectId = project.id
  const { selectedDocPath, setSelectedDocPath, previewTocOpen, setPreviewTocOpen } =
    useProjectPreview(projectId)

  const {
    html: previewHtml,
    rendering: previewRendering,
    toc: previewToc,
    previewRef,
    onDocChange: handlePreviewDocChange,
    onTocClick: handlePreviewTocClick
  } = usePreviewDocument({
    onDocPathChange: (path) => setSelectedDocPath(path)
  })

  const handleRemoveProject = async () => {
    if (!project) return
    const ok = window.confirm(
      `确定要从列表中移除 ${project.name || project.repoPath} 吗？文件仍保留在磁盘上。`
    )
    if (!ok) return
    await removeProject(project.id)
    navigate('/')
  }

  return (
    <WorkspaceLayout
      project={project}
      onDocChange={handlePreviewDocChange}
      previewDocPath={selectedDocPath}
      previewHtml={previewHtml}
      previewRendering={previewRendering}
      previewRef={previewRef}
      previewToc={previewToc}
      onTocClick={handlePreviewTocClick}
      previewTocOpen={previewTocOpen}
      onTogglePreviewToc={setPreviewTocOpen}
      onRemoveProject={handleRemoveProject}
    />
  )
}
