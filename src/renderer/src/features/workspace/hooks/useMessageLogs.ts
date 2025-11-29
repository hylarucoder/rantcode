/**
 * 按需加载消息日志的 Hook
 *
 * 日志现在存储在独立文件中，需要通过 API 按需加载
 */
import { useState, useEffect, useCallback } from 'react'
import { orpc } from '@/lib/orpcQuery'
import type { LogEntry } from '../types'

interface UseMessageLogsOptions {
  projectId: string
  sessionId: string
  traceId: string | undefined
  /** 是否自动加载 */
  autoLoad?: boolean
  /** 每页加载数量 */
  pageSize?: number
}

interface UseMessageLogsResult {
  logs: LogEntry[]
  total: number
  hasMore: boolean
  loading: boolean
  error: string | null
  /** 加载日志 */
  load: () => Promise<void>
  /** 加载更多 */
  loadMore: () => Promise<void>
  /** 重置并重新加载 */
  reload: () => Promise<void>
}

type SessionsApi = {
  getMessageLogs?: {
    call: (input: {
      projectId: string
      sessionId: string
      traceId: string
      offset?: number
      limit?: number
    }) => Promise<{
      logs: LogEntry[]
      total: number
      hasMore: boolean
    }>
  }
}

export function useMessageLogs({
  projectId,
  sessionId,
  traceId,
  autoLoad = false,
  pageSize = 100
}: UseMessageLogsOptions): UseMessageLogsResult {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!traceId) {
      setLogs([])
      setTotal(0)
      setHasMore(false)
      return
    }

    const api = (orpc as { sessions?: SessionsApi }).sessions
    if (!api?.getMessageLogs) {
      setError('API not available')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await api.getMessageLogs.call({
        projectId,
        sessionId,
        traceId,
        offset: 0,
        limit: pageSize
      })
      setLogs(result.logs)
      setTotal(result.total)
      setHasMore(result.hasMore)
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Failed to load logs'
      setError(msg)
      console.error('[useMessageLogs] Failed to load:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId, sessionId, traceId, pageSize])

  const loadMore = useCallback(async () => {
    if (!traceId || !hasMore || loading) return

    const api = (orpc as { sessions?: SessionsApi }).sessions
    if (!api?.getMessageLogs) return

    setLoading(true)

    try {
      const result = await api.getMessageLogs.call({
        projectId,
        sessionId,
        traceId,
        offset: logs.length,
        limit: pageSize
      })
      setLogs((prev) => [...prev, ...result.logs])
      setTotal(result.total)
      setHasMore(result.hasMore)
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Failed to load more logs'
      setError(msg)
      console.error('[useMessageLogs] Failed to load more:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId, sessionId, traceId, pageSize, logs.length, hasMore, loading])

  const reload = useCallback(async () => {
    setLogs([])
    setTotal(0)
    setHasMore(false)
    await load()
  }, [load])

  // 自动加载
  useEffect(() => {
    if (autoLoad && traceId) {
      void load()
    }
  }, [autoLoad, traceId, load])

  return {
    logs,
    total,
    hasMore,
    loading,
    error,
    load,
    loadMore,
    reload
  }
}
