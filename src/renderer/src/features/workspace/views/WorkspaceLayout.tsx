import { useCallback } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { Card } from '@/components/ui/card'
import { RightPanel } from '@/features/workspace/components/RightPanel'
import { ActivityBar } from '@/features/workspace/components/ActivityBar'
import { ProjectSettingsPanel } from '@/features/workspace/components/ProjectSettingsPanel'
import { GitPanel } from '@/features/workspace/components/GitPanel'
import { KanbanPanel } from '@/features/workspace/components/KanbanPanel'
import { SpecExplorer } from '@/features/spec'
import DocCommandPalette from '@/features/spec/components/DocCommandPalette'
import { fetchFile } from '@/features/spec/api/fs'
import type { ProjectInfo, SpecDocMeta } from '@/types'
import type { PreviewTocItem } from '@/features/preview'
import { useGlobalChatStore } from '@/features/global-chat'
import { useProjectUI } from '@/features/workspace/hooks/useProjectUI'

/**
 * WorkspaceLayout - 项目工作区布局
 *
 * 简化后的布局，聊天功能已移至全局对话面板。
 * 主要提供：文档浏览、看板、Git、项目设置视图。
 */
export function WorkspaceLayout({
  project,
  onDocChange,
  previewDocPath,
  previewHtml,
  previewRendering,
  previewRef,
  previewToc,
  onTocClick,
  previewTocOpen,
  onTogglePreviewToc,
  onRemoveProject
}: {
  project: ProjectInfo
  onDocChange: (doc: SpecDocMeta | null) => void
  previewDocPath: string | null
  previewHtml: string | null
  previewRendering: boolean
  previewRef: React.RefObject<HTMLDivElement | null>
  previewToc: PreviewTocItem[]
  onTocClick: (index: number) => void
  previewTocOpen: boolean
  onTogglePreviewToc: (open: boolean) => void
  onRemoveProject?: () => void
}) {
  // 使用持久化的活动视图状态，而不是本地 useState
  const { activeView, setActiveView } = useProjectUI(project.id)

  // 全局对话面板
  const openGlobalChat = useGlobalChatStore((s) => s.open)
  const setGlobalChatProject = useGlobalChatStore((s) => s.setSelectedProjectId)
  const setReferenceFilePath = useGlobalChatStore((s) => s.setReferenceFilePath)

  // 处理从看板或文档跳转到聊天
  const handleChatWithFile = useCallback(
    (filePath: string) => {
      // 打开全局对话面板，并设置当前项目和引用文件路径
      setGlobalChatProject(project.id)
      setReferenceFilePath(filePath)
      openGlobalChat()
    },
    [project.id, setGlobalChatProject, setReferenceFilePath, openGlobalChat]
  )

  // 处理预览区链接导航
  const handlePreviewNavigate = useCallback(
    async (path: string) => {
      try {
        const file = await fetchFile({ base: 'agent-docs', path, projectId: project.id })
        const doc: SpecDocMeta = {
          path: file.path,
          content: file.content,
          title: file.path.split('/').pop()
        }
        onDocChange(doc)
      } catch (err) {
        console.error('Failed to navigate to document:', err)
      }
    },
    [project.id, onDocChange]
  )

  // Git 视图是全屏的
  if (activeView === 'git') {
    return (
      <div className="flex h-full min-h-0">
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />
        <div className="flex-1 overflow-hidden">
          <GitPanel projectId={project.id} />
        </div>
      </div>
    )
  }

  // 看板视图是全屏的
  if (activeView === 'kanban') {
    return (
      <div className="flex h-full min-h-0">
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />
        <div className="flex-1 overflow-hidden">
          <KanbanPanel projectId={project.id} onChatWithFile={handleChatWithFile} />
        </div>
      </div>
    )
  }

  // 设置视图是全屏的
  if (activeView === 'settings') {
    return (
      <div className="flex h-full min-h-0">
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />
        <div className="flex-1 overflow-auto">
          <ProjectSettingsPanel project={project} onRemoveProject={onRemoveProject} />
        </div>
      </div>
    )
  }

  // 文档视图：左侧文件树 + 右侧预览
  return (
    <div className="flex h-full min-h-0">
      {/* Activity Bar - 左侧图标栏 */}
      <ActivityBar activeView={activeView} onViewChange={setActiveView} />

      {/* Main content area */}
      <PanelGroup direction="horizontal" className="flex h-full min-h-0 flex-1 bg-transparent pr-4">
        {/* Global docs command palette (Cmd/Ctrl + K) */}
        <DocCommandPalette onDocChange={onDocChange} />

        {/* Left: Document Explorer */}
        <Panel defaultSize={30} minSize={20} className="flex min-h-0 min-w-[220px]">
          <div className="flex min-h-0 flex-1 items-stretch [&>*]:w-full">
            <SpecExplorer
              showPreview={false}
              onDocChange={onDocChange}
              onChatWithFile={handleChatWithFile}
            />
          </div>
        </Panel>
        <PanelResizeHandle className="w-px bg-border/70 hover:bg-primary/50 data-[resize-handle-active]:bg-primary" />

        {/* Right: File preview */}
        <Panel defaultSize={70} minSize={40} className="flex min-h-0">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Card className="relative flex min-h-0 flex-1 flex-col gap-3 rounded-none border-0 px-3 pb-0 pt-3 shadow-none">
              <RightPanel
                docPath={previewDocPath}
                previewHtml={previewHtml}
                previewRendering={previewRendering}
                previewRef={previewRef}
                previewToc={previewToc}
                tocOpen={previewTocOpen}
                onToggleToc={onTogglePreviewToc}
                onTocClick={onTocClick}
                onNavigate={handlePreviewNavigate}
              />
            </Card>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
