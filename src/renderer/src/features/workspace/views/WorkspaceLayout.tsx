// no local state
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { Card } from '@/components/ui/card'
import { SessionList } from '@/features/workspace/components/SessionList'
import { MessageList } from '@/features/workspace/components/MessageList'
import { Composer } from '@/features/workspace/components/Composer'
import { RightPanel } from '@/features/workspace/components/RightPanel'
// removed extra options UI
// import { cn } from "@/lib/utils";
import { SpecExplorer } from '@/features/spec'
import DocCommandPalette from '@/features/spec/components/DocCommandPalette'
import type { ProjectInfo, SpecDocMeta } from '@/types'
import type { CodexRunOptions } from '@shared/types/webui'
import { CodexMessageBubble } from '@/features/workspace/components/CodexMessageBubble'
import { UserMessageBubble } from '@/features/workspace/components/UserMessageBubble'
import { AssistantMessageBubble } from '@/features/workspace/components/AssistantMessageBubble'
import type { ChatMessage, ChatSession } from '@/features/workspace/types'
import type { PreviewTocItem } from '@/features/preview'

// moved to features/workspace/components/CodexMessageBubble

function renderBubble(msg: ChatMessage) {
  const isUser = msg.role === 'user'
  const isCodex = msg.role === 'assistant' && !!msg.jobId
  if (isCodex) {
    return <CodexMessageBubble msg={msg} />
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
  engine,
  onEngineChange,
  onDocChange,
  previewDocPath,
  previewHtml,
  previewRendering,
  previewRef,
  previewToc,
  onTocClick,
  previewTocOpen,
  onTogglePreviewToc
}: {
  project: ProjectInfo
  sessions: ChatSession[]
  activeSessionId: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
  messages: ChatMessage[]
  input: string
  onInputChange: (v: string) => void
  onSend: () => void
  isRunning: boolean
  onInterrupt: () => void
  engine: NonNullable<CodexRunOptions['engine']>
  onEngineChange: (e: NonNullable<CodexRunOptions['engine']>) => void
  onDocChange: (doc: SpecDocMeta | null) => void
  previewDocPath: string | null
  previewHtml: string | null
  previewRendering: boolean
  previewRef: React.RefObject<HTMLDivElement | null>
  previewToc: PreviewTocItem[]
  onTocClick: (index: number) => void
  previewTocOpen: boolean
  onTogglePreviewToc: (open: boolean) => void
}) {
  return (
    <PanelGroup
      direction="horizontal"
      className="flex h-full min-h-0 bg-transparent px-4 py-0"
    >
      {/* Global docs command palette (Cmd/Ctrl + K) */}
      <DocCommandPalette onDocChange={onDocChange} />
      {/* Left: Session list + files (vertically resizable) */}
      <Panel defaultSize={24} minSize={16} className="flex min-h-0 min-w-[220px]">
        <PanelGroup direction="vertical" className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <Panel defaultSize={45} minSize={24} className="flex min-h-0">
            <Card className="flex h-full min-h-0 flex-1 rounded-none border-0 p-0 shadow-none">
              <SessionList
                sessions={sessions}
                activeId={activeSessionId}
                onSelect={onSelectSession}
                onNew={onNewSession}
              />
            </Card>
          </Panel>
          <PanelResizeHandle className="h-px bg-border/70 hover:bg-primary/50 data-[resize-handle-active]:bg-primary" />
          <Panel defaultSize={55} minSize={24} className="flex min-h-0">
            <div className="flex min-h-0 flex-1 items-stretch [&>*]:w-full">
              <SpecExplorer showPreview={false} onDocChange={onDocChange} />
            </div>
          </Panel>
        </PanelGroup>
      </Panel>
      <PanelResizeHandle className="w-px bg-border/70 hover:bg-primary/50 data-[resize-handle-active]:bg-primary" />

      {/* Center: Exec output */}
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
            <MessageList<ChatMessage> messages={messages} renderMessage={renderBubble} />
            <Composer
              value={input}
              onChange={onInputChange}
              onSend={onSend}
              isRunning={isRunning}
              onInterrupt={onInterrupt}
              engine={engine}
              onEngineChange={onEngineChange}
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
  )
}
