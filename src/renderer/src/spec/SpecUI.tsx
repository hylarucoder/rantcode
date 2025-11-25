import { useMemo, useState } from 'react'
import { FileDiff, FolderOpen, Wrench } from 'lucide-react'
import { SpecExplorer } from '@/features/spec'
import DiffView from './Diff'
import WorkView from './Work'

export default function SpecUI() {
  const [tab, setTab] = useState<string>('explorer')

  const menuItems = useMemo(
    () => [
      { key: 'explorer', icon: <FolderOpen className="h-4 w-4" />, label: 'Explorer' },
      { key: 'diff', icon: <FileDiff className="h-4 w-4" />, label: 'Diff' },
      { key: 'work', icon: <Wrench className="h-4 w-4" />, label: 'Work' }
    ],
    []
  )

  const body = useMemo(() => {
    switch (tab) {
      case 'diff':
        return <DiffView />
      case 'work':
        return <WorkView />
      case 'explorer':
      default:
        return <SpecExplorer />
    }
  }, [tab])

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      <aside className="flex w-56 flex-col border-r border-border bg-background/90">
        <div className="flex h-12 items-center px-4 text-sm font-semibold tracking-tight">
          rantcode-cli
        </div>
        <nav className="flex-1 py-2">
          {menuItems.map((item) => {
            const active = tab === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 min-h-0 p-3">{body}</main>
    </div>
  )
}
