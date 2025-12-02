import { useEffect, useMemo, useState } from 'react'
import { File } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { useFsTreeQuery, fetchFile } from '@/features/spec'
import type { FsTreeNode, SpecDocMeta } from '@/types'
import { useProject } from '@/state/workspace'

function flattenTree(root: FsTreeNode | null): { path: string; name: string }[] {
  if (!root) return []
  const out: { path: string; name: string }[] = []
  const walk = (node: FsTreeNode) => {
    if (!node) return
    if (!node.dir) {
      const p = node.path || node.name
      out.push({ path: p, name: node.name || p })
    }
    for (const child of node.children || []) walk(child)
  }
  walk(root)
  return out
}

export default function DocCommandPalette({
  onDocChange
}: {
  onDocChange: (doc: SpecDocMeta | null) => void
}) {
  const { projectId } = useProject()
  const [open, setOpen] = useState(false)
  const docsTree = useFsTreeQuery({ base: 'agent-docs', depth: 8, projectId, enabled: !!projectId })
  const repoTree = useFsTreeQuery({
    base: 'repo',
    depth: 8,
    projectId,
    enabled: !!projectId && !!docsTree.isError
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const docsRoot = (docsTree.data as FsTreeNode | null) || null
  const repoRoot = (repoTree.data as FsTreeNode | null) || null
  const docsFiles = useMemo(() => flattenTree(docsRoot), [docsRoot])
  const repoFiles = useMemo(() => flattenTree(repoRoot), [repoRoot])

  const loading = !!docsTree.isLoading || (!!docsTree.isError && !!repoTree.isLoading)
  const groups = useMemo(() => {
    if (docsFiles.length > 0) return [{ label: 'agent-docs', files: docsFiles, base: 'agent-docs' as const }]
    if (repoFiles.length > 0) return [{ label: 'repo', files: repoFiles, base: 'repo' as const }]
    return []
  }, [docsFiles, repoFiles])

  const handleSelect = async (path: string, base: 'agent-docs' | 'repo') => {
    if (!projectId) return
    try {
      const file = await fetchFile({ base, path, projectId })
      const doc: SpecDocMeta = {
        path: file.path,
        content: file.content,
        title: file.path.split('/').pop()
      }
      onDocChange(doc)
      setOpen(false)
    } catch {
      // ignore
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="搜索文档文件… (Cmd/Ctrl + K)" />
      <CommandList>
        {loading && <div className="p-2 text-xs text-muted-foreground">Loading…</div>}
        {!loading && groups.length === 0 && <CommandEmpty>没有可用的文档文件</CommandEmpty>}
        {groups.map((g) => (
          <CommandGroup key={g.label} heading={g.label}>
            {g.files.map((f) => (
              <CommandItem
                key={`${g.label}:${f.path}`}
                onSelect={() => handleSelect(f.path, g.base)}
              >
                <File className="h-4 w-4" />
                <span className="truncate">{f.name}</span>
                <span className="ml-2 truncate text-muted-foreground">{f.path}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
