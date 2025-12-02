import { useState, useEffect } from 'react'
import { humanizeRelativeTime, formatAbsoluteTime } from '@shared/utils/humanize'
import { cn } from '@/lib/utils'

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
 * - 相对时间每分钟自动更新
 */
export function MessageTimestamp({
  timestamp,
  mode = 'relative',
  onModeChange,
  className
}: MessageTimestampProps) {
  const [now, setNow] = useState(() => Date.now())

  // 相对时间模式下每分钟更新一次
  useEffect(() => {
    if (mode !== 'relative' || !timestamp) return
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [mode, timestamp])

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
}
