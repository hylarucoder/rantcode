/**
 * 将毫秒转换为人类可读的时间格式
 *
 * @example
 * humanizeDuration(500)    // "500ms"
 * humanizeDuration(1500)   // "1.5s"
 * humanizeDuration(65000)  // "1m 5s"
 * humanizeDuration(3600000) // "1h"
 */
export function humanizeDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.round((ms % 60_000) / 1000)
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`
}

/**
 * 将时间戳转换为相对时间描述（中文）
 *
 * @example
 * humanizeRelativeTime(Date.now() - 5000)   // "刚刚"
 * humanizeRelativeTime(Date.now() - 65000)  // "1 分钟前"
 * humanizeRelativeTime(Date.now() - 3600000) // "1 小时前"
 */
export function humanizeRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp
  if (diff < 0) return '刚刚'
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) {
    const mins = Math.floor(diff / 60_000)
    return `${mins} 分钟前`
  }
  if (diff < 86400_000) {
    const hours = Math.floor(diff / 3600_000)
    return `${hours} 小时前`
  }
  if (diff < 604800_000) {
    const days = Math.floor(diff / 86400_000)
    return `${days} 天前`
  }
  // 超过 7 天，显示绝对日期
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/**
 * 格式化时间戳为绝对时间字符串
 *
 * @example
 * formatAbsoluteTime(1732896000000) // "14:20"
 * formatAbsoluteTime(1732896000000, true) // "2024/11/29 14:20"
 */
export function formatAbsoluteTime(timestamp: number, showDate: boolean = false): string {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  if (showDate) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}/${month}/${day} ${hours}:${minutes}`
  }

  return `${hours}:${minutes}`
}

