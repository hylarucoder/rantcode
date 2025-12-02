import { memo, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { MessageTimestamp, type TimeDisplayMode } from './MessageTimestamp'

interface UserMessageBubbleProps {
  text: string
  timestamp?: number
  timeMode?: TimeDisplayMode
  onTimeModeChange?: (mode: TimeDisplayMode) => void
}

export const UserMessageBubble = memo(function UserMessageBubble({
  text,
  timestamp,
  timeMode = 'relative',
  onTimeModeChange
}: UserMessageBubbleProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('复制失败')
    }
  }

  return (
    <div className={cn('flex justify-end group')}>
      <div className="flex flex-col items-end gap-0.5 max-w-[80%]">
        <div className="flex items-center gap-1.5">
          {/* 复制按钮 - hover 时显示 */}
          <button
            type="button"
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
            title="复制消息"
          >
            {copied ? (
              <Check className="size-3 text-green-500" />
            ) : (
              <Copy className="size-3 text-muted-foreground" />
            )}
          </button>
          <div
            className={cn(
              'whitespace-pre-wrap rounded-xl px-3 py-1.5 text-sm bg-primary text-primary-foreground'
            )}
          >
            {text}
          </div>
        </div>
        <MessageTimestamp
          timestamp={timestamp}
          mode={timeMode}
          onModeChange={onTimeModeChange}
          className="mr-1"
        />
      </div>
    </div>
  )
})
