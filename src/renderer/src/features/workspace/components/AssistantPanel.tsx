import { Bot, Zap, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { CodexRunOptions } from '@shared/types/webui'

interface AssistantPanelProps {
  agent: NonNullable<CodexRunOptions['agent']>
  onAgentChange: (agent: NonNullable<CodexRunOptions['agent']>) => void
}

const agents: { id: NonNullable<CodexRunOptions['agent']>; name: string; description: string }[] = [
  {
    id: 'claude-code-glm',
    name: 'Claude Code (GLM)',
    description: '基于 Claude Code 的全局语言模型助手'
  },
  { id: 'codex', name: 'Codex', description: 'OpenAI Codex CLI 代码助手' }
]

export function AssistantPanel({ agent, onAgentChange }: AssistantPanelProps) {
  const currentAgent = agents.find((a) => a.id === agent) ?? agents[0]

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Bot className="h-4 w-4" />
        助手配置
      </div>

      <Card className="flex flex-col gap-4 border-border/50 p-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">当前助手</label>
          <Select value={agent} onValueChange={(v) => onAgentChange(v as typeof agent)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择助手" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    {a.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md bg-muted/50 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{currentAgent?.description}</p>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 border-border/50 p-4">
        <div className="text-xs font-medium text-muted-foreground">快捷操作</div>
        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" className="justify-start gap-2">
            <Zap className="h-3.5 w-3.5" />
            重新加载助手
          </Button>
        </div>
      </Card>
    </div>
  )
}

