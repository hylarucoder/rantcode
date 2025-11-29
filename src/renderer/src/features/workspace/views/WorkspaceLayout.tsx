import { useState } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { Card } from '@/components/ui/card'
import { MessageList } from '@/features/workspace/components/MessageList'
import { Composer } from '@/features/workspace/components/Composer'
import { RightPanel } from '@/features/workspace/components/RightPanel'
import { ActivityBar, type ActivityView } from '@/features/workspace/components/ActivityBar'
import { SessionsAssistantsPanel } from '@/features/workspace/components/SessionsAssistantsPanel'
import { ProjectSettingsPanel } from '@/features/workspace/components/ProjectSettingsPanel'
import { GitPanel } from '@/features/workspace/components/GitPanel'
import { KanbanPanel } from '@/features/workspace/components/KanbanPanel'
import { SpecExplorer } from '@/features/spec'
import DocCommandPalette from '@/features/spec/components/DocCommandPalette'
import type { ProjectInfo, SpecDocMeta } from '@/types'
import type { AgentRunOptions } from '@shared/types/webui'
import { AgentMessageBubble } from '@/features/workspace/components/AgentMessageBubble'
import { UserMessageBubble } from '@/features/workspace/components/UserMessageBubble'
import { AssistantMessageBubble } from '@/features/workspace/components/AssistantMessageBubble'
import type { Message, Session } from '@/features/workspace/types'
import type { PreviewTocItem } from '@/features/preview'

// moved to features/workspace/components/AgentMessageBubble

function renderBubble(msg: Message) {
  const isUser = msg.role === 'user'
  const isAgent = msg.role === 'assistant' && !!msg.jobId
  if (isAgent) {
    return <AgentMessageBubble msg={msg} />
  }
  if (isUser) return <UserMessageBubble key={msg.id} text={msg.content} />
  return <AssistantMessageBubble key={msg.id} text={msg.content} />
}

export function WorkspaceLayout({
  project,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  messages,
  input,
  onInputChange,
  onSend,
  isRunning,
  onInterrupt,
  runner,
  onRunnerChange,
  agentId,
  onAgentIdChange,
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
  sessions: Session[]
  activeSessionId: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
  messages: Message[]
  input: string
  onInputChange: (v: string) => void
  onSend: () => void
  isRunning: boolean
  onInterrupt: () => void
  /** 底层 Runner（执行器） */
  runner: NonNullable<AgentRunOptions['runner']>
  onRunnerChange: (r: NonNullable<AgentRunOptions['runner']>) => void
  /** Agent ID（角色） */
  agentId: string
  onAgentIdChange: (id: string) => void
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
  const [activeView, setActiveView] = useState<ActivityView>('sessions')

  // 根据当前视图渲染左侧面板内容
  const renderLeftPanelContent = () => {
    switch (activeView) {
      case 'sessions':
        return (
          <Card className="flex h-full min-h-0 flex-1 flex-col rounded-none border-0 p-0 shadow-none">
            <SessionsAssistantsPanel
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={onSelectSession}
              onNewSession={onNewSession}
              agentId={agentId}
              onAgentIdChange={onAgentIdChange}
            />
          </Card>
        )
      case 'docs':
        return (
          <div className="flex min-h-0 flex-1 items-stretch [&>*]:w-full">
            <SpecExplorer showPreview={false} onDocChange={onDocChange} />
          </div>
        )
      default:
        return null
    }
  }

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
          <KanbanPanel projectId={project.id} />
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

  return (
    <div className="flex h-full min-h-0">
      {/* Activity Bar - 左侧图标栏 */}
      <ActivityBar activeView={activeView} onViewChange={setActiveView} />

      {/* Main content area */}
      <PanelGroup direction="horizontal" className="flex h-full min-h-0 flex-1 bg-transparent pr-4">
        {/* Global docs command palette (Cmd/Ctrl + K) */}
        <DocCommandPalette onDocChange={onDocChange} />

        {/* Left: Dynamic content based on active view */}
        <Panel defaultSize={24} minSize={16} className="flex min-h-0 min-w-[220px]">
          {renderLeftPanelContent()}
        </Panel>
        <PanelResizeHandle className="w-px bg-border/70 hover:bg-primary/50 data-[resize-handle-active]:bg-primary" />

        {/* Center: Chat / Exec output */}
        <Panel defaultSize={38} minSize={24} className="flex min-h-0">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Card className="flex min-h-0 flex-1 flex-col gap-3 rounded-none border-0 px-3 pb-0 pt-3 shadow-none">
              <p className="mb-1 text-xs text-muted-foreground">
                Ask questions about{' '}
                <span className="inline-block rounded bg-card px-1.5 py-0.5 font-mono text-xs">
                  {project.name || project.repoPath}
                </span>
                .
              </p>
              <MessageList<Message> messages={messages} renderMessage={renderBubble} />
              <Composer
                value={input}
                onChange={onInputChange}
                onSend={onSend}
                isRunning={isRunning}
                onInterrupt={onInterrupt}
                runner={runner}
                onRunnerChange={onRunnerChange}
              />
            </Card>
          </div>
        </Panel>
        <PanelResizeHandle className="w-px bg-border/70 hover:bg-primary/50 data-[resize-handle-active]:bg-primary" />

        {/* Right: File preview / Conversation log */}
        <Panel defaultSize={38} minSize={24} className="flex min-h-0">
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
              />
            </Card>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
