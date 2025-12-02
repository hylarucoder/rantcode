import { memo } from 'react'
import { humanizeRelativeTime, formatAbsoluteTime } from '@shared/utils/humanize'
import { cn } from '@/lib/utils'
import { useSharedNow } from '@/shared/hooks/useSharedNow'

export type TimeDisplayMode = 'relative' | 'absolute'

interface MessageTimestampProps {
  timestamp?: number
  mode?: TimeDisplayMode
  onModeChange?: (mode: TimeDisplayMode) => void
  className?: string
}

/**
 * 消息时间戳组件
 * - 支持相对时间和绝对时间切换
 * - 点击可切换显示模式
 * - 相对时间使用共享定时器每分钟自动更新（避免每个组件独立创建定时器）
 */
export const MessageTimestamp = memo(function MessageTimestamp({
  timestamp,
  mode = 'relative',
  onModeChange,
  className
}: MessageTimestampProps) {
  // 使用共享的当前时间，所有 MessageTimestamp 组件共享同一个定时器
  const now = useSharedNow()

  if (!timestamp) return null

  const handleClick = () => {
    onModeChange?.(mode === 'relative' ? 'absolute' : 'relative')
  }

  const timeText =
    mode === 'relative' ? humanizeRelativeTime(timestamp, now) : formatAbsoluteTime(timestamp)

  return (
    <button
      type="button"
      onClick={handleClick}
      title={mode === 'relative' ? '点击显示具体时间' : '点击显示相对时间'}
      className={cn(
        'text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer select-none',
        className
      )}
    >
      {timeText}
    </button>
  )
})
