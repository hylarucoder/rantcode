import PreviewPanel from '@/features/workspace/components/PreviewPanel'
import type { PreviewTocItem } from '@/features/preview'

export function RightPanel({
  docPath,
  previewHtml,
  previewRendering,
  previewRef,
  previewToc,
  tocOpen,
  onToggleToc,
  onTocClick,
  onNavigate
}: {
  docPath?: string | null
  previewHtml?: string | null
  previewRendering?: boolean
  previewRef: React.RefObject<HTMLDivElement | null>
  previewToc: PreviewTocItem[]
  tocOpen: boolean
  onToggleToc: (next: boolean) => void
  onTocClick: (index: number) => void
  onNavigate?: (path: string) => void
}) {
  return (
    <>
      <PreviewPanel
        docPath={docPath}
        html={previewHtml}
        rendering={previewRendering}
        previewRef={previewRef}
        toc={previewToc}
        tocOpen={tocOpen}
        onToggleToc={onToggleToc}
        onTocClick={onTocClick}
        onNavigate={onNavigate}
      />
    </>
  )
}
