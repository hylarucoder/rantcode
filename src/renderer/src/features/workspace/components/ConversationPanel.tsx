import { ConversationLog } from '@/features/logs'

export default function ConversationPanel() {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ConversationLog />
    </div>
  )
}
