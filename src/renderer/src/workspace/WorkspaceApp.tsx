import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { SpecExplorer } from '@/features/spec'
// Removed extra logs/conversation entries per request
import { ProjectProvider } from '@/state/workspace'

const menuItems = [{ key: 'explorer', icon: <FolderOpen className="h-4 w-4" />, label: 'Explorer' }]

export default function WorkspaceApp({ projectId }: { projectId: string }) {
  const [active, setActive] = useState('explorer')

  return (
    <ProjectProvider projectId={projectId}>
      <div className="flex h-full bg-background text-foreground">
        <aside className="flex w-52 flex-col border-r border-border bg-background/90">
          <nav className="flex-1 py-2">
            {menuItems.map((item) => {
              const isActive = active === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActive(item.key)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    isActive
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
        <main className="flex-1 overflow-auto p-4">
          {active === 'explorer' && <SpecExplorer />}
        </main>
      </div>
    </ProjectProvider>
  )
}
