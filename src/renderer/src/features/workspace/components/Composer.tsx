import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFsTreeQuery } from '@/features/spec/api/hooks'
import { useProject } from '@/state/workspace'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { RunnerRunOptions } from '@shared/types/webui'
import { RUNNER_UI_LIST } from '@shared/runners'
import { Send, Square, Loader2 } from 'lucide-react'
import { Claude } from '@lobehub/icons'

type ExecRunner = NonNullable<RunnerRunOptions['runner']>

export function Composer({
  value,
  onChange,
  onSend,
  isRunning,
  onInterrupt,
  runner,
  onRunnerChange,
  runnerConfigured
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  isRunning: boolean
  onInterrupt: () => void
  /** 底层 Runner（执行器） */
  runner: ExecRunner
  onRunnerChange: (r: ExecRunner) => void
  /** 当前 Runner / Agent 是否已正确配置（用于 UI 提示颜色） */
  runnerConfigured?: boolean
}) {
  const { t } = useTranslation()
  // 工作区与 agent-docs 列表
  const { projectId } = useProject()
  const docsTree = useFsTreeQuery({ base: 'agent-docs', depth: 8, projectId, enabled: !!projectId })
  const filePaths = useMemo(() => {
    type TreeNode = { dir: boolean; path: string; children?: TreeNode[] }
    const out: string[] = []
    const node = docsTree.data as unknown as TreeNode | undefined
    const walk = (n: TreeNode | undefined): void => {
      if (!n) return
      if (n.dir) {
        ;(n.children || []).forEach(walk)
      } else if (n.path) {
        // 规范化成 agent-docs 相对路径（fs.tree 已返回相对仓库根的路径）
        // 这里直接使用 path 即可，它已是相对路径，且我们只查询 base='agent-docs'
        out.push(n.path.startsWith('agent-docs/') ? n.path.slice('agent-docs/'.length) : n.path)
      }
    }
    walk(node)
    return out
  }, [docsTree.data])

  // @ 文件引用提示
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const suggestions = useMemo(() => {
    if (!mentionOpen) return [] as string[]
    const q = mentionQuery.trim().toLowerCase()
    const source = q ? filePaths.filter((p) => p.toLowerCase().includes(q)) : filePaths
    return source.slice(0, 20)
  }, [mentionOpen, mentionQuery, filePaths])

  function findActiveMention(text: string, caret: number): { start: number; query: string } | null {
    const prefix = text.slice(0, caret)
    const at = prefix.lastIndexOf('@')
    if (at === -1) return null
    // 若 @ 之后存在空白，则不是活跃 mention
    const slice = prefix.slice(at + 1)
    if (/\s/.test(slice)) return null
    // @ 前必须是开头或空白/(/
    if (at > 0) {
      const prev = prefix[at - 1]
      if (prev && !/\s|\(/.test(prev)) return null
    }
    return { start: at, query: slice }
  }

  function applySelection(selected: string) {
    if (!textareaRef.current) return
    const el = textareaRef.current
    const caret = el.selectionStart ?? value.length
    const active = findActiveMention(value, caret)
    if (!active) return
    const before = value.slice(0, active.start)
    const after = value.slice(caret)
    const insert = `@agent-docs/${selected} `
    const next = `${before}${insert}${after}`
    onChange(next)
    // 将光标移动到插入后
    const pos = (before + insert).length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
    setMentionOpen(false)
    setMentionQuery('')
    setActiveIndex(0)
  }

  // 当 value 变化时，检测是否处于 @ mention 模式
  useEffect(() => {
    if (!textareaRef.current) return
    const caret = textareaRef.current.selectionStart ?? value.length
    const active = findActiveMention(value, caret)
    if (active) {
      setMentionOpen(true)
      setMentionQuery(active.query)
    } else {
      setMentionOpen(false)
      setMentionQuery('')
      setActiveIndex(0)
    }
  }, [value])

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-muted/30 shadow-sm transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
      {/* @ 文件引用提示浮层 */}
      {mentionOpen && suggestions.length > 0 && (
        <div className="absolute left-2 right-2 bottom-full z-20 mb-2 max-h-56 overflow-auto rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-lg">
          {suggestions.map((p, idx) => (
            <button
              key={p}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                applySelection(p)
              }}
              className={cn(
                'w-full truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent',
                idx === activeIndex ? 'bg-accent text-accent-foreground' : ''
              )}
            >
              @agent-docs/{p}
            </button>
          ))}
        </div>
      )}

      {/* 输入区域 */}
      <Textarea
        ref={textareaRef}
        value={value}
        placeholder={t('workspace.composer.placeholder')}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="resize-none border-0 bg-transparent px-3 pt-3 pb-1 text-sm shadow-none focus-visible:ring-0"
        onKeyDown={(e) => {
          // @ 文件提示时的键盘导航
          if (mentionOpen && !e.metaKey && !e.ctrlKey) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIndex((i) => Math.min(i + 1, Math.max(0, suggestions.length - 1)))
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIndex((i) => Math.max(0, i - 1))
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              if (suggestions[activeIndex]) {
                e.preventDefault()
                applySelection(suggestions[activeIndex])
                return
              }
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setMentionOpen(false)
              setMentionQuery('')
              return
            }
          }

          // 发送：Cmd+Enter（mac）或 Ctrl+Enter（其他）
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onSend()
          }
        }}
      />

      {/* 内嵌工具栏 */}
      <div className="flex items-center justify-between gap-2 border-t border-border/40 px-2 py-1.5">
        {/* 左侧：Runner 选择器 */}
        <div className="flex items-center gap-1">
          <Select value={runner} onValueChange={(v) => onRunnerChange(v as ExecRunner)}>
            <SelectTrigger
              size="sm"
              className={cn(
                'h-7 w-auto gap-1 border-0 bg-transparent px-2 text-xs shadow-none hover:bg-accent/50 focus:ring-0',
                runnerConfigured === false ? 'text-muted-foreground/60' : 'text-muted-foreground'
              )}
              title={t('workspace.composer.selectRunner')}
            >
              <Claude
                className={cn(
                  'h-3 w-3',
                  runnerConfigured === false ? 'text-muted-foreground/50' : 'text-primary'
                )}
              />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RUNNER_UI_LIST.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 中间：快捷键提示 */}
        <span className="hidden text-[10px] text-muted-foreground/60 sm:block">
          {isMac ? '⌘' : 'Ctrl'}+Enter {t('workspace.composer.sendHint')}
        </span>

        {/* 右侧：发送/中断按钮 */}
        <Button
          type="button"
          size="sm"
          variant={isRunning ? 'destructive' : 'default'}
          className="group relative h-7 gap-1.5 rounded-lg px-3 text-xs overflow-hidden"
          onClick={isRunning ? onInterrupt : onSend}
          disabled={isRunning ? false : !value.trim()}
        >
          {isRunning ? (
            <>
              {/* 默认显示：加载中状态 */}
              <span className="flex items-center gap-1.5 transition-opacity group-hover:opacity-0">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('workspace.composer.sending')}
              </span>
              {/* Hover 时显示：中断提示 */}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 text-xs opacity-0 transition-opacity group-hover:opacity-100">
                <Square className="h-3 w-3" />
                {t('workspace.composer.interruptHint')}
              </span>
            </>
          ) : (
            <>
              <Send className="h-3 w-3" />
              {t('workspace.composer.send')}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
