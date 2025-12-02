import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/lib/orpcQuery'
import type { RunnerEvent, DocsWatcherEvent } from '@shared/types/webui'

/**
 * 自动刷新 Git 状态的 Hook
 *
 * 监听以下事件来触发刷新：
 * 1. Runner 执行完成（exit 事件）- AI 操作完成后刷新
 * 2. Docs 文件变化（agent-docs 目录）- 文档变更时刷新
 *
 * 使用防抖机制避免频繁刷新：
 * - 默认等待 800ms 无新事件后才执行刷新
 * - 最长等待 3 秒强制刷新（避免连续操作时长时间不刷新）
 */
export function useGitAutoRefresh(projectId: string, enabled = true) {
  const queryClient = useQueryClient()
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef(false)

  const DEBOUNCE_MS = 800 // 防抖延迟
  const MAX_WAIT_MS = 3000 // 最长等待时间

  // 执行刷新
  const doRefresh = useCallback(() => {
    if (!projectId) return

    // 清理定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    if (maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current)
      maxWaitTimerRef.current = null
    }
    pendingRef.current = false

    // 使 git status 查询失效，触发重新获取
    const statusQuery = orpc.git.status.queryOptions({ input: { projectId } })
    void queryClient.invalidateQueries({ queryKey: statusQuery.queryKey })
  }, [projectId, queryClient])

  // 触发防抖刷新
  const scheduleRefresh = useCallback(() => {
    if (!enabled) return

    // 清理之前的防抖定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // 设置防抖定时器
    debounceTimerRef.current = setTimeout(doRefresh, DEBOUNCE_MS)

    // 如果还没有设置最长等待定时器，设置一个
    if (!pendingRef.current) {
      pendingRef.current = true
      maxWaitTimerRef.current = setTimeout(doRefresh, MAX_WAIT_MS)
    }
  }, [enabled, doRefresh])

  // 订阅 Runner 事件
  useEffect(() => {
    if (!enabled || !projectId) return undefined

    const win = window as unknown as {
      api?: { runners?: { subscribe?: (h: (e: RunnerEvent) => void) => () => void } }
    }
    const runnerBridge = win.api?.runners
    if (!runnerBridge?.subscribe) return undefined

    const unsubscribe = runnerBridge.subscribe((event: RunnerEvent) => {
      // 只在 exit 事件时刷新（Runner 执行完成）
      if (event.type === 'exit') {
        scheduleRefresh()
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [enabled, projectId, scheduleRefresh])

  // 订阅 Docs 文件变化事件
  useEffect(() => {
    if (!enabled || !projectId) return undefined

    type DocsSubscribe = (
      opts: { projectId?: string },
      handler: (event: DocsWatcherEvent) => void
    ) => () => void

    const docsApi = (
      window as unknown as {
        api?: { docs?: { subscribe?: DocsSubscribe } }
      }
    ).api?.docs

    if (!docsApi?.subscribe) return undefined

    const unsubscribe = docsApi.subscribe({ projectId }, (event) => {
      // 文件变化时刷新
      if (event.kind === 'file') {
        scheduleRefresh()
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [enabled, projectId, scheduleRefresh])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (maxWaitTimerRef.current) {
        clearTimeout(maxWaitTimerRef.current)
      }
    }
  }, [])
}
