import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Card } from '@/components/ui/card'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { api } from '../lib/api'
import type { DiffChangeItem, DiffFileResponse, SplitRow, SplitSide } from '../types'

function SplitDiff({ rows }: { rows: SplitRow[] }) {
  const cellStyle = (t: SplitSide): CSSProperties => {
    switch (t) {
      case 'del':
        return { background: 'color-mix(in oklab, var(--destructive) 15%, transparent)' }
      case 'add':
        return { background: 'color-mix(in oklab, var(--primary) 15%, transparent)' }
      case 'meta':
        return { color: 'var(--muted-foreground)' }
      default:
        return {}
    }
  }
  const wrap: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '6ch 1fr 6ch 1fr',
    columnGap: 8,
    rowGap: 2,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  }
  const cellBase: CSSProperties = {
    whiteSpace: 'pre-wrap',
    padding: '0 8px',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    maxWidth: '100%'
  }
  const lnStyle: CSSProperties = {
    textAlign: 'right',
    color: 'var(--muted-foreground)',
    userSelect: 'none',
    padding: '0 4px'
  }
  return (
    <div className="overflow-x-auto overflow-y-hidden max-w-full">
      <div style={wrap}>
        {rows.map((r, i) => {
          const ln = r.ln ?? ''
          const rn = r.rn ?? ''
          return (
            <Fragment key={i}>
              <div style={lnStyle}>{ln}</div>
              <div style={{ ...cellBase, ...cellStyle(r.lt) }}>{r.left}</div>
              <div style={lnStyle}>{rn}</div>
              <div style={{ ...cellBase, ...cellStyle(r.rt) }}>{r.right}</div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function DiffBody({ diff }: { diff: string }) {
  const lines = (diff || '').split(/\r?\n/)
  return (
    <pre
      className="whitespace-pre-wrap m-0 font-mono max-w-full overflow-x-auto break-words"
      style={{ overflowWrap: 'anywhere' }}
    >
      {lines.map((ln, i) => {
        let color = 'var(--foreground)'
        if (ln.startsWith('+') && !ln.startsWith('+++')) {
          color = 'var(--primary)'
        } else if (ln.startsWith('-') && !ln.startsWith('---')) {
          color = 'var(--destructive)'
        } else if (ln.startsWith('@@') || ln.startsWith('diff ')) {
          color = 'var(--accent-foreground)'
        }
        return (
          <div key={i} style={{ color }}>
            {ln}
          </div>
        )
      })}
    </pre>
  )
}

export default function DiffView() {
  const [items, setItems] = useState<DiffChangeItem[]>([])
  const [selected, setSelected] = useState<DiffChangeItem | null>(null)
  const [diff, setDiff] = useState<string>('')
  const [specOnly, setSpecOnly] = useState<boolean>(false)
  const [view, setView] = useState<'unified' | 'split'>('split')
  const [splitRows, setSplitRows] = useState<SplitRow[]>([])

  async function loadChanges(only: boolean) {
    const q = `/api/diff/changes?mode=all&specOnly=${only ? '1' : '0'}`
    const arr = await api<DiffChangeItem[]>(q)
    setItems(arr)
    if (arr.length) {
      openFile(arr[0])
    } else {
      setSelected(null)
      setDiff('')
    }
  }

  async function openFile(it: DiffChangeItem) {
    setSelected(it)
    const q = `/api/diff/file?path=${encodeURIComponent(it.path)}&mode=all${view === 'split' ? '&format=split' : ''}`
    const d = await api<DiffFileResponse>(q)
    setDiff(d.diff || '')
    setSplitRows(d.split || [])
  }

  useEffect(() => {
    loadChanges(specOnly)
  }, [specOnly])
  useEffect(() => {
    if (selected && view === 'split') {
      openFile(selected)
    }
  }, [view])

  const grouped = useMemo(() => {
    const m: Record<string, DiffChangeItem[]> = {}
    for (const it of items) {
      const g = it.group || 'Other'
      if (!m[g]) m[g] = []
      m[g].push(it)
    }
    return m
  }, [items])

  return (
    <PanelGroup direction="horizontal" className="flex h-full min-h-0 flex-1">
      <Panel defaultSize={35} minSize={20} maxSize={60} className="min-w-[260px]">
        <Card className="flex h-full flex-col rounded-none border-0 shadow-none">
          <div className="flex items-center gap-2 px-3 pb-2">
            <span className="text-sm font-semibold">Changes</span>
            <button
              type="button"
              onClick={() => setSpecOnly((v) => !v)}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs transition-colors ${
                specOnly
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              }`}
            >
              Spec only
            </button>
            <div className="flex-1" />
            <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-xs">
              {(
                [
                  { key: 'split', label: 'Side by side' },
                  { key: 'unified', label: 'Unified' }
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setView(opt.key)}
                  className={`px-2 py-0.5 ${
                    view === opt.key
                      ? 'rounded-sm bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-full overflow-auto">
            {Object.keys(grouped).map((group) => (
              <div key={group} className="mb-3">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                </span>
                <div className="space-y-1">
                  {grouped[group].map((it) => {
                    const isActive = selected?.path === it.path
                    return (
                      <button
                        key={it.path}
                        type="button"
                        className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition-colors ${
                          isActive
                            ? 'bg-accent text-accent-foreground'
                            : 'bg-transparent text-foreground hover:bg-accent/40'
                        }`}
                        onClick={() => openFile(it)}
                      >
                        <span className="truncate">{it.path}</span>
                        <span className="ml-2 flex-shrink-0 text-[11px] uppercase text-muted-foreground">
                          {it.status}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Panel>
      <PanelResizeHandle className="w-px bg-border/70 hover:bg-primary/50 data-[resize-handle-active]:bg-primary" />
      <Panel defaultSize={65} minSize={30}>
        <Card className="flex h-full min-w-0 flex-1 flex-col rounded-none border-0 shadow-none">
          <div className="px-3 pb-2 text-sm font-semibold">{selected ? selected.path : 'Diff'}</div>
          <div className="h-full max-w-full overflow-auto">
            {view === 'split' ? (
              splitRows && splitRows.length ? (
                <SplitDiff rows={splitRows} />
              ) : (
                <p className="text-sm text-muted-foreground">No diff</p>
              )
            ) : diff ? (
              <DiffBody diff={diff} />
            ) : (
              <p className="text-sm text-muted-foreground">No diff</p>
            )}
          </div>
        </Card>
      </Panel>
    </PanelGroup>
  )
}
