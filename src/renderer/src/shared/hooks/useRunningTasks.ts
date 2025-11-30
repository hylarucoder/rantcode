import { useState, useEffect, useRef } from 'react'
import { useProjectChatStore } from '@/features/workspace/state/store'
import type { Message } from '@/features/workspace/types'

export interface RunningTask {
  projectId: string
  sessionId: string
  sessionTitle: string
  message: Message
  /** 运行时长（毫秒） */
  duration: number
}

/**
 * 从 projects 状态中提取运行中的任务 ID 列表
 * 用于比较是否发生变化
 */
function getRunningTaskIds(
  projects: Record<
    string,
    { sessions: { id: string; messages: { id: string; status?: string }[] }[] }
  >
): string[] {
  const ids: string[] = []
  for (const [projectId, projectState] of Object.entries(projects)) {
    for (const session of projectState.sessions) {
      for (const message of session.messages) {
        if (message.status === 'running') {
          ids.push(`${projectId}:${session.id}:${message.id}`)
        }
      }
    }
  }
  return ids.sort()
}

/**
 * 从 projects 状态中提取运行中的任务
 */
function extractRunningTasks(
  projects: Record<string, { sessions: { id: string; title: string; messages: Message[] }[] }>
): RunningTask[] {
  const now = Date.now()
  const tasks: RunningTask[] = []

  for (const [projectId, projectState] of Object.entries(projects)) {
    for (const session of projectState.sessions) {
      for (const message of session.messages) {
        if (message.status === 'running') {
          tasks.push({
            projectId,
            sessionId: session.id,
            sessionTitle: session.title,
            message,
            duration: message.startedAt ? now - message.startedAt : 0
          })
        }
      }
    }
  }

  // 按开始时间排序（最新的在前）
  return tasks.sort((a, b) => {
    const aTime = a.message.startedAt ?? 0
    const bTime = b.message.startedAt ?? 0
    return bTime - aTime
  })
}

/**
 * 获取所有正在运行的任务（跨所有项目）
 * 用于状态栏显示运行中的任务列表
 */
export function useRunningTasks(): RunningTask[] {
  const [tasks, setTasks] = useState<RunningTask[]>([])
  const prevIdsRef = useRef<string>('')

  useEffect(() => {
    // 初始加载
    const projects = useProjectChatStore.getState().projects
    setTasks(extractRunningTasks(projects))
    prevIdsRef.current = getRunningTaskIds(projects).join(',')

    // 订阅变化
    const unsubscribe = useProjectChatStore.subscribe((state) => {
      const newIds = getRunningTaskIds(state.projects).join(',')
      // 只有当运行中的任务列表发生变化时才更新
      if (newIds !== prevIdsRef.current) {
        prevIdsRef.current = newIds
        setTasks(extractRunningTasks(state.projects))
      }
    })

    return unsubscribe
  }, [])

  return tasks
}
