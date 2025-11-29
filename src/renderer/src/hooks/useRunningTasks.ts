import { useMemo } from 'react'
import { useProjectChatStore } from '@/features/workspace/state/store'
import type { Message, Session } from '@/features/workspace/types'

export interface RunningTask {
  projectId: string
  sessionId: string
  sessionTitle: string
  message: Message
  /** 运行时长（毫秒） */
  duration: number
}

/**
 * 获取所有正在运行的任务（跨所有项目）
 * 用于状态栏显示运行中的任务列表
 */
export function useRunningTasks(): RunningTask[] {
  const projects = useProjectChatStore((s) => s.projects)
  // 订阅 version 变化以触发更新
  const versions = useProjectChatStore((s) =>
    Object.fromEntries(Object.entries(s.projects).map(([id, p]) => [id, p.version]))
  )
  void versions // 仅用于触发更新

  return useMemo(() => {
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
  }, [projects])
}

