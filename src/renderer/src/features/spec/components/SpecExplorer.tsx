import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ListTree, PanelsTopLeft, MessageSquare, FileText, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Tree,
  type TreeViewElement,
  Folder as TreeFolder,
  File as TreeFile
} from '@/components/ui/file-tree'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@/components/ui/context-menu'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { fetchFile } from '@/features/spec/api/fs'
import { useFsTreeQuery } from '@/features/spec/api/hooks'
import { usePreviewDocument } from '@/features/preview'
import { useDocsWatcher, useDocContent, useDocsStore } from '@/state/docs'
import type { DocsWatcherEvent } from '@shared/types/webui'
import { useProject } from '@/state/workspace'
import type { FsTreeNode, SpecDocMeta } from '@/types'

interface ExplorerProps {
  showPreview?: boolean
  treeTitle?: ReactNode
  onDocChange?: (doc: SpecDocMeta | null) => void
  /** 右键"聊聊"文件时的回调，传入文件路径 */
  onChatWithFile?: (filePath: string) => void
}

export default function SpecExplorer({
  showPreview = true,
  treeTitle = 'Files',
  onDocChange,
  onChatWithFile
}: ExplorerProps = {}) {
  const [root, setRoot] = useState<FsTreeNode | null>(null)
  const [loading] = useState(false)
  const [, setSelectedPath] = useState<string>('')
  const [tocOpen, setTocOpen] = useState(false)
  const {
    doc,
    html: renderedHtml,
    rendering,
    toc,
    previewRef,
    onDocChange: setPreviewDoc,
    setDoc: updatePreviewDoc,
    onTocClick: handlePreviewTocClick
  } = usePreviewDocument()
  const initialDocOpenedRef = useRef(false)
  const treeBaseRef = useRef<'docs'>('docs')
  const { projectId } = useProject()
  useDocsWatcher(projectId)
  const setInitialDocContent = useDocsStore((state) => state.setInitialContent)
  const liveDocEntry = useDocContent(projectId, doc?.path)

  function resetInitialDocFlag() {
    initialDocOpenedRef.current = false
  }

  const findFirstFilePath = useCallback((node: FsTreeNode | null): string | null => {
    const walk = (current: FsTreeNode | null): string | null => {
      if (!current) return null
      if (!current.dir) {
        return current.path || current.name || null
      }
      const children = current.children ?? []
      for (const child of children) {
        if (!child) continue
        if (child.dir) {
          const nested = walk(child)
          if (nested) return nested
        } else if (child.path || child.name) {
          return child.path || child.name || null
        }
      }
      return null
    }
    return walk(node)
  }, [])

  // 仅使用 docs 目录，不再回退到 repo
  const docsTree = useFsTreeQuery({ base: 'docs', depth: 8, projectId, enabled: !!projectId })
  // 在当前组件内基于 watcher 事件触发文件树 refetch，避免 queryKey 不匹配问题
  useEffect(() => {
    if (!projectId) return undefined
    type DocsSubscribe = (
      opts: { projectId?: string },
      handler: (event: DocsWatcherEvent) => void
    ) => () => void
    const docsApi = (
      window as unknown as {
        api?: { docs?: { subscribe?: DocsSubscribe } }
      }
    ).api?.docs
    if (!docsApi?.subscribe) return undefined
    let scheduled = false
    const flush = () => {
      scheduled = false
      void docsTree.refetch()
    }
    const unsubscribe = docsApi.subscribe({ projectId }, (event) => {
      if (event.kind === 'file' || event.kind === 'ready') {
        if (!scheduled) {
          scheduled = true
          queueMicrotask(flush)
        }
      }
    })
    return () => unsubscribe?.()
  }, [projectId, docsTree.refetch])

  const openPath = useCallback(
    async (p: string, base?: 'docs' | 'repo') => {
      if (!projectId) return
      setSelectedPath(p)
      const effectiveBase = base ?? treeBaseRef.current
      try {
        const file = await fetchFile({ base: effectiveBase, path: p, projectId })
        const d: SpecDocMeta = {
          path: file.path,
          content: file.content,
          title: file.path.split('/').pop()
        }
        setPreviewDoc(d)
        setInitialDocContent(projectId, d.path, d.content ?? '')
      } catch (err) {
        console.error(err)
        setPreviewDoc({ path: p, content: '(failed to load file)' })
      }
    },
    [projectId, setInitialDocContent, setPreviewDoc]
  )

  // 处理预览区链接点击
  const handlePreviewLinkClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href) return

      // 处理锚点链接（页内跳转）
      if (href.startsWith('#')) {
        e.preventDefault()
        const id = href.slice(1)
        const el = document.getElementById(id)
        el?.scrollIntoView({ behavior: 'smooth' })
        return
      }

      // 处理相对路径的 .md 文件链接
      if (href.endsWith('.md') && !href.startsWith('http://') && !href.startsWith('https://')) {
        e.preventDefault()
        if (!doc?.path) return

        // 解析相对路径
        const basePath = doc.path.split('/').slice(0, -1).join('/')
        const parts = href.split('/')
        const resolvedParts = basePath ? basePath.split('/') : []

        for (const part of parts) {
          if (part === '..') {
            resolvedParts.pop()
          } else if (part !== '.') {
            resolvedParts.push(part)
          }
        }

        const resolvedPath = resolvedParts.join('/')
        void openPath(resolvedPath)
        return
      }

      // 外部链接在新窗口打开
      if (href.startsWith('http://') || href.startsWith('https://')) {
        e.preventDefault()
        window.open(href, '_blank', 'noopener,noreferrer')
      }
    },
    [doc?.path, openPath]
  )

  useEffect(() => {
    if (!projectId) return
    if (docsTree.isSuccess && docsTree.data) {
      const node = docsTree.data as FsTreeNode
      treeBaseRef.current = 'docs'
      setRoot(node)
      if (!initialDocOpenedRef.current) {
        const firstPath = findFirstFilePath(node)
        if (firstPath) {
          initialDocOpenedRef.current = true
          void openPath(firstPath, 'docs')
        }
      }
      return
    }
    // 发生错误时，仅提示一次，不再回退
    if (docsTree.isError) {
      const msg = docsTree.error instanceof Error ? docsTree.error.message : 'Failed to load docs'
      toast.error(msg)
    }
  }, [
    docsTree.isSuccess,
    docsTree.isError,
    docsTree.data,
    docsTree.error,
    projectId,
    openPath,
    findFirstFilePath
  ])
  useEffect(() => () => resetInitialDocFlag(), [projectId])

  // 避免父子之间因回调标识变化造成的重复通知/渲染环（尤其在父级基于该回调更新本地状态时）。
  // 仅当文档的 path 或 content 实际发生变化时才触发通知。
  const lastNotifiedRef = useRef<{ path: string | null; content?: string } | null>(null)
  useEffect(() => {
    const sig = doc ? { path: doc.path ?? null, content: doc.content } : { path: null }
    const prev = lastNotifiedRef.current
    const samePath = prev?.path === sig.path
    const sameContent = prev?.content === sig.content
    if (samePath && sameContent) return
    lastNotifiedRef.current = sig
    onDocChange?.(doc)
  }, [doc, onDocChange])

  useEffect(() => {
    if (!doc?.path || typeof liveDocEntry?.content !== 'string') {
      return
    }
    updatePreviewDoc(
      (prev) => {
        if (!prev || prev.path !== doc.path || prev.content === liveDocEntry.content) {
          return prev
        }
        return { ...prev, content: liveDocEntry.content }
      },
      { notifyPath: false }
    )
  }, [doc?.path, liveDocEntry?.content, updatePreviewDoc])

  const decoratedRoot = useMemo(() => (root ? { ...root, name: 'docs' as string } : null), [root])

  // 复制文件路径
  const handleCopyPath = useCallback(async (filePath: string) => {
    try {
      await navigator.clipboard.writeText(filePath)
      toast.success('已复制路径')
    } catch {
      toast.error('复制失败')
    }
  }, [])

  // 聊聊这个文件
  const handleChatWith = useCallback(
    (filePath: string) => {
      if (onChatWithFile) {
        onChatWithFile(filePath)
      } else {
        toast.info(`@docs/${filePath}`, { description: '可以在聊天输入框中引用此文件' })
      }
    },
    [onChatWithFile]
  )

  // 渲染文件的右键菜单
  const renderFileContextMenu = useCallback(
    (filePath: string): React.ReactNode => (
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => openPath(filePath)}>
          <FileText className="h-4 w-4" />
          打开预览
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleChatWith(filePath)}>
          <MessageSquare className="h-4 w-4" />
          聊聊这个文件
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => handleCopyPath(filePath)}>
          <Copy className="h-4 w-4" />
          复制路径
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleCopyPath(`@docs/${filePath}`)}>
          <ExternalLink className="h-4 w-4" />
          复制引用
        </ContextMenuItem>
      </ContextMenuContent>
    ),
    [openPath, handleChatWith, handleCopyPath]
  )

  const treeElements: TreeViewElement[] = useMemo(() => {
    if (!decoratedRoot) return []
    const toElements = (node: FsTreeNode): TreeViewElement => ({
      id: node.path || node.name,
      name: node.name || node.path || '',
      isSelectable: !node.dir,
      children: (node.children || []).map(toElements)
    })
    return [toElements(decoratedRoot)]
  }, [decoratedRoot])

  const treeCard = (
    <Card className="flex h-full min-h-0 flex-col rounded-none border-0 p-3 shadow-none">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <ListTree className="h-3.5 w-3.5" />
        {treeTitle}
      </div>
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="flex h-full items-center justify-center">
            <PanelsTopLeft className="h-5 w-5 animate-pulse text-muted-foreground" />
          </div>
        )}
        {!loading && decoratedRoot && treeElements.length > 0 && (
          <Tree
            elements={treeElements}
            className="h-full"
            initialExpandedItems={[treeElements[0]?.id]}
          >
            {treeElements.map((el) => (
              <TreeFolder key={el.id} value={el.id} element={el.name}>
                {el.children?.map((child) =>
                  child.children && child.children.length > 0 ? (
                    <TreeFolder key={child.id} value={child.id} element={child.name}>
                      {child.children?.map((grand) =>
                        grand.children && grand.children.length > 0 ? (
                          <TreeFolder key={grand.id} value={grand.id} element={grand.name}>
                            {/* deeper levels */}
                          </TreeFolder>
                        ) : (
                          <TreeFile
                            key={grand.id}
                            value={grand.id}
                            onClick={() => openPath(grand.id)}
                            fileContextMenu={renderFileContextMenu(grand.id)}
                          >
                            {grand.name}
                          </TreeFile>
                        )
                      )}
                    </TreeFolder>
                  ) : (
                    <TreeFile
                      key={child.id}
                      value={child.id}
                      onClick={() => openPath(child.id)}
                      fileContextMenu={renderFileContextMenu(child.id)}
                    >
                      {child.name}
                    </TreeFile>
                  )
                )}
              </TreeFolder>
            ))}
          </Tree>
        )}
        {!loading && !decoratedRoot && (
          <p className="text-xs text-muted-foreground">No files to display.</p>
        )}
      </div>
    </Card>
  )

  if (!showPreview) {
    return treeCard
  }

  return (
    <PanelGroup direction="horizontal" className="flex h-full min-h-0 flex-1">
      <Panel defaultSize={40} minSize={20} maxSize={60} className="min-w-[260px]">
        {treeCard}
      </Panel>
      <PanelResizeHandle className="w-px bg-border/70 hover:bg-primary/50 data-[resize-handle-active]:bg-primary" />
      <Panel defaultSize={65} minSize={30}>
        <Card className="relative flex h-full min-w-0 flex-1 flex-col rounded-none border-0 shadow-none">
          <div className="flex items-center gap-2 px-3 pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-semibold">Preview</span>
              {doc?.path && (
                <span className="truncate text-xs text-muted-foreground">{doc.path}</span>
              )}
            </div>
            {toc.length > 0 && (
              <button
                type="button"
                onClick={() => setTocOpen((v) => !v)}
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/40"
              >
                <ListTree className="h-4 w-4" />
                <span className="sr-only">Toggle table of contents</span>
              </button>
            )}
          </div>
          <div className="relative flex-1 min-h-0 overflow-auto pr-2 text-sm">
            {!doc && (
              <p className="text-sm text-muted-foreground">Select a file on the left to preview.</p>
            )}
            {doc && !rendering && renderedHtml && (
              <div
                className="markdown-body [&_a]:text-primary [&_a]:underline [&_a:hover]:text-primary/80"
                ref={previewRef}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
                onClick={handlePreviewLinkClick}
              />
            )}
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs text-muted-foreground">
                Rendering preview…
              </div>
            )}
          </div>
          {tocOpen && toc.length > 0 && (
            <div className="absolute right-3 top-10 z-20 max-h-64 min-w-[180px] max-w-[260px] overflow-y-auto rounded-md border border-border/70 bg-popover px-2 py-2 text-xs text-popover-foreground shadow-md">
              <div className="mb-1 text-[11px] font-semibold text-muted-foreground">目录</div>
              <div className="flex flex-col gap-0.5">
                {toc.map((item) => (
                  <button
                    key={`${item.level}-${item.index}-${item.text}`}
                    type="button"
                    onClick={() => handlePreviewTocClick(item.index)}
                    className={cn(
                      'w-full rounded px-1.5 py-0.5 text-left hover:bg-accent/30',
                      item.level === 1 ? 'font-semibold' : item.level === 3 ? 'opacity-75' : '',
                      item.level === 2 ? 'pl-3' : item.level === 3 ? 'pl-5' : ''
                    )}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </Panel>
    </PanelGroup>
  )
}
