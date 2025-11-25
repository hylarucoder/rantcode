import { useState } from 'react'
import { MessageCircle, Terminal as TerminalIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import XtermTerminal from '@/features/logs/components/XtermTerminal'
import ConversationLog from '@/features/logs/components/ConversationLog'

type LogsTab = 'terminal' | 'conversation'

export default function LogsPage() {
  const [tab, setTab] = useState<LogsTab>('conversation')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center gap-2">
        <Button
          size="sm"
          variant={tab === 'terminal' ? 'default' : 'secondary'}
          onClick={() => setTab('terminal')}
          className="gap-2"
        >
          <TerminalIcon className="h-4 w-4" />
          Terminal
        </Button>
        <Button
          size="sm"
          variant={tab === 'conversation' ? 'default' : 'secondary'}
          onClick={() => setTab('conversation')}
          className="gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          Conversation Log
        </Button>
      </div>
      <Card className="flex-1 min-h-0 overflow-hidden p-2">
        {tab === 'terminal' && (
          <div className="flex h-full min-h-0">
            <XtermTerminal />
          </div>
        )}
        {tab === 'conversation' && (
          <div className="flex h-full min-h-0">
            <ConversationLog />
          </div>
        )}
      </Card>
    </div>
  )
}
