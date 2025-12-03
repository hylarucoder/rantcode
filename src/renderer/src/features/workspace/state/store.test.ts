import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useProjectChatStore } from './chatStore'
import { useProjectUIStore } from './uiStore'
import type { Session } from '@/features/workspace/types'
import type { RunnerEvent } from '@shared/types/webui'

const PROJECT_ID = 'project-test'

const baseSession: Session = {
  id: 'session-1',
  title: 'Session 1',
  messages: [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      traceId: 'job-1',
      logs: [],
      status: 'running'
    }
  ]
}

beforeEach(() => {
  useProjectChatStore.setState({ projects: {} })
  useProjectUIStore.setState({ projects: {} })
})

afterEach(() => {
  useProjectChatStore.setState({ projects: {} })
  useProjectUIStore.setState({ projects: {} })
})

describe('useProjectChatStore', () => {
  it('initializes project and appends messages', () => {
    const chatStore = useProjectChatStore.getState()
    chatStore.ensure(PROJECT_ID, () => ({
      sessions: [baseSession],
      activeSessionId: baseSession.id
    }))

    chatStore.appendMessages(PROJECT_ID, baseSession.id, [
      { id: 'user-1', role: 'user', content: 'hello' }
    ])

    const project = useProjectChatStore.getState().projects[PROJECT_ID]
    expect(project?.sessions).toHaveLength(1)
    expect(project?.sessions[0].messages).toHaveLength(2)
    expect(project?.activeSessionId).toBe(baseSession.id)
  })

  it('applies codex log, text and exit events to assistant message', () => {
    const chatStore = useProjectChatStore.getState()
    chatStore.ensure(PROJECT_ID, () => ({
      sessions: [baseSession],
      activeSessionId: baseSession.id
    }))

    // log 事件只更新 logs 数组
    const logEvent: RunnerEvent = {
      type: 'log',
      traceId: 'job-1',
      stream: 'stdout',
      data: 'echo'
    }

    chatStore.applyRunnerEvent(PROJECT_ID, logEvent)

    const afterLog = useProjectChatStore.getState().projects[PROJECT_ID]?.sessions[0].messages[0]
    expect(afterLog?.logs).toHaveLength(1)
    expect(afterLog?.logs?.[0].text).toBe('echo')

    // text 事件更新 output
    const textEvent: RunnerEvent = {
      type: 'text',
      traceId: 'job-1',
      text: 'Hello world',
      delta: false
    }

    chatStore.applyRunnerEvent(PROJECT_ID, textEvent)

    const afterText = useProjectChatStore.getState().projects[PROJECT_ID]?.sessions[0].messages[0]
    expect(afterText?.output).toBe('Hello world')

    const exitEvent: RunnerEvent = {
      type: 'exit',
      traceId: 'job-1',
      code: 0,
      signal: null,
      durationMs: 5
    }
    chatStore.applyRunnerEvent(PROJECT_ID, exitEvent)

    const afterExit = useProjectChatStore.getState().projects[PROJECT_ID]?.sessions[0].messages[0]
    expect(afterExit?.status).toBe('success')
  })
})

describe('useProjectUIStore', () => {
  it('updates UI preferences independently', () => {
    const uiStore = useProjectUIStore.getState()
    uiStore.ensure(PROJECT_ID)
    uiStore.setSelectedDocPath(PROJECT_ID, 'docs/readme.md')
    uiStore.setRightTab(PROJECT_ID, 'trace')
    uiStore.setPreviewTocOpen(PROJECT_ID, true)

    const project = useProjectUIStore.getState().projects[PROJECT_ID]
    expect(project?.selectedDocPath).toBe('docs/readme.md')
    expect(project?.rightTab).toBe('trace')
    expect(project?.previewTocOpen).toBe(true)
  })
})
