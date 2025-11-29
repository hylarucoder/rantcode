import { AgentTraceTimeline } from '@/features/logs'

export default function AgentTracePanel() {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <AgentTraceTimeline />
    </div>
  )
}
