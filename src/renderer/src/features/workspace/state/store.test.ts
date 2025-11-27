import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceChatStore, useWorkspacePreviewStore } from './store'
import type { ChatSession } from '@/features/workspace/types'
import type { CodexEvent } from '@shared/types/webui'

const WORKSPACE_ID = 'ws-test'

const baseSession: ChatSession = {
  id: 'session-1',
  title: 'Session 1',
  messages: [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      jobId: 'job-1',
      logs: [],
      status: 'running'
    }
  ]
}

beforeEach(() => {
  useWorkspaceChatStore.setState({ workspaces: {} })
  useWorkspacePreviewStore.setState({ workspaces: {} })
})

afterEach(() => {
  useWorkspaceChatStore.setState({ workspaces: {} })
  useWorkspacePreviewStore.setState({ workspaces: {} })
})

describe('useWorkspaceChatStore', () => {
  it('initializes workspace and appends messages', () => {
    const chatStore = useWorkspaceChatStore.getState()
    chatStore.ensure(WORKSPACE_ID, () => ({
      sessions: [baseSession],
      activeSessionId: baseSession.id
    }))

    chatStore.appendMessages(WORKSPACE_ID, baseSession.id, [
      { id: 'user-1', role: 'user', content: 'hello' }
    ])

    const workspace = useWorkspaceChatStore.getState().workspaces[WORKSPACE_ID]
    expect(workspace?.sessions).toHaveLength(1)
    expect(workspace?.sessions[0].messages).toHaveLength(2)
    expect(workspace?.activeSessionId).toBe(baseSession.id)
  })

  it('applies codex log, text and exit events to assistant message', () => {
    const chatStore = useWorkspaceChatStore.getState()
    chatStore.ensure(WORKSPACE_ID, () => ({
      sessions: [baseSession],
      activeSessionId: baseSession.id
    }))

    // log 事件只更新 logs 数组
    const logEvent: CodexEvent = {
      type: 'log',
      jobId: 'job-1',
      stream: 'stdout',
      data: 'echo'
    }

    chatStore.applyCodexEvent(WORKSPACE_ID, logEvent)

    const afterLog =
      useWorkspaceChatStore.getState().workspaces[WORKSPACE_ID]?.sessions[0].messages[0]
    expect(afterLog?.logs).toHaveLength(1)
    expect(afterLog?.logs?.[0].text).toBe('echo')

    // text 事件更新 output
    const textEvent: CodexEvent = {
      type: 'text',
      jobId: 'job-1',
      text: 'Hello world',
      delta: false
    }

    chatStore.applyCodexEvent(WORKSPACE_ID, textEvent)

    const afterText =
      useWorkspaceChatStore.getState().workspaces[WORKSPACE_ID]?.sessions[0].messages[0]
    expect(afterText?.output).toBe('Hello world')

    const exitEvent: CodexEvent = {
      type: 'exit',
      jobId: 'job-1',
      code: 0,
      signal: null,
      durationMs: 5
    }
    chatStore.applyCodexEvent(WORKSPACE_ID, exitEvent)

    const afterExit =
      useWorkspaceChatStore.getState().workspaces[WORKSPACE_ID]?.sessions[0].messages[0]
    expect(afterExit?.status).toBe('success')
  })
})

describe('useWorkspacePreviewStore', () => {
  it('updates preview preferences independently', () => {
    const previewStore = useWorkspacePreviewStore.getState()
    previewStore.ensure(WORKSPACE_ID)
    previewStore.setSelectedDocPath(WORKSPACE_ID, 'docs/readme.md')
    previewStore.setRightTab(WORKSPACE_ID, 'conversation')
    previewStore.setPreviewTocOpen(WORKSPACE_ID, true)

    const workspace = useWorkspacePreviewStore.getState().workspaces[WORKSPACE_ID]
    expect(workspace?.selectedDocPath).toBe('docs/readme.md')
    expect(workspace?.rightTab).toBe('conversation')
    expect(workspace?.previewTocOpen).toBe(true)
  })
})
