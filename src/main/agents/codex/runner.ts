import { webContents, Notification, BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { AgentEvent, AgentRunOptions } from '../../../shared/types/webui'
import { resolveProjectRoot } from '../../rpc'
import { isErrorLike } from '../../../shared/utils/errorLike'
import { buildCodexArgs } from './cli'
import { findExecutable, AGENT_CONFIGS } from '../detect'
import { runClaudeCodeStreaming, cancelClaudeCode } from '../claudecode'

type ExecAgent = NonNullable<AgentRunOptions['agent']>

const runningProcesses = new Map<string, ChildProcessWithoutNullStreams>()

interface CodexJobState {
  stderrBuffer: string
  stdoutLineBuffer: string
  stderrLineBuffer: string
  sessionId?: string
}

const jobStates = new Map<string, CodexJobState>()

// 判断是否是 Claude Code 类型的 agent
function isClaudeCodeAgent(agent: string): boolean {
  return agent.startsWith('claude-code')
}

function getWebContents(targetId: number): WebContents | null {
  const contents = webContents.fromId(targetId)
  return contents ?? null
}

import { notifyCodex } from '../../notifyBridge'

function dispatchEvent(targetId: number, payload: AgentEvent): void {
  notifyCodex(targetId, payload)
}

function notifyRunResult(
  targetId: number,
  options: { ok: boolean; durationMs?: number; code?: number; cwd?: string }
): void {
  try {
    // Show system notification only when the target window is not focused (background)
    const contents = getWebContents(targetId)
    let isFocused = false
    try {
      const win = contents ? BrowserWindow.fromWebContents(contents) : null
      isFocused = !!(win && win.isVisible() && win.isFocused())
    } catch {
      // noop
    }
    if (isFocused) return

    const ok = options.ok
    const title = ok ? '执行完成' : '执行失败'
    const parts: string[] = []
    if (typeof options.durationMs === 'number') parts.push(`${options.durationMs}ms`)
    if (!ok && typeof options.code === 'number') parts.push(`exit ${options.code}`)
    if (options.cwd) parts.push(options.cwd)
    const body = parts.filter(Boolean).join(' · ')
    const notification = new Notification({ title, body, silent: false })
    notification.on('click', () => {
      const c = getWebContents(targetId)
      c?.focus()
    })
    notification.show()
  } catch {
    // ignored - notification failures in headless/test environments
  }
}

export async function runCodex(
  targetContentsId: number,
  payload: AgentRunOptions
): Promise<{ jobId: string }> {
  const prompt = payload?.prompt?.trim()
  if (!prompt) {
    throw new Error('Prompt is required to run codex')
  }

  const agent: ExecAgent = (payload.agent as ExecAgent) ?? 'codex'

  // 如果是 Claude Code agent，委托给 claudecode runner
  if (isClaudeCodeAgent(agent)) {
    return runClaudeCodeStreaming(targetContentsId, payload)
  }

  // 以下是 Codex 原生逻辑
  const jobId =
    typeof payload?.jobId === 'string' && payload.jobId.length > 0 ? payload.jobId : randomUUID()
  const repoRoot = await resolveProjectRoot(payload?.projectId)
  const bin = await findExecutable(agent)
  const args =
    agent === 'codex'
      ? buildCodexArgs({ extraArgs: payload?.extraArgs, sessionId: payload?.sessionId })
      : Array.isArray(payload?.extraArgs)
        ? payload!.extraArgs!.filter((s) => typeof s === 'string' && s.length > 0)
        : []

  // 构建环境变量
  const agentConfig = AGENT_CONFIGS[agent]
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' }
  if (agentConfig.baseUrl) {
    env.ANTHROPIC_BASE_URL = agentConfig.baseUrl
  }

  // Print final command to the terminal for debugging
  try {
    const cmdStr = [bin, ...args].join(' ')
    console.log(`[rantcode][${agent}] spawn:`, cmdStr, '\n cwd:', repoRoot)
  } catch {
    // ignored - debug logging is non-critical
  }

  const child = spawn(bin, args, {
    cwd: repoRoot,
    env,
    stdio: 'pipe'
  })

  jobStates.set(jobId, {
    stderrBuffer: '',
    stdoutLineBuffer: '',
    stderrLineBuffer: '',
    sessionId: payload.sessionId
  })
  runningProcesses.set(jobId, child)

  const startedAt = Date.now()
  dispatchEvent(targetContentsId, {
    type: 'start',
    jobId,
    command: [bin, ...args],
    cwd: repoRoot
  })

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    const state = jobStates.get(jobId)
    const data = chunk.toString()

    if (!state) {
      dispatchEvent(targetContentsId, {
        type: 'log',
        jobId,
        stream: 'stdout',
        data
      })
      return
    }

    // Append to per-job stdout line buffer and emit complete lines
    const buffer = state.stdoutLineBuffer + data
    const lines = buffer.split(/\r?\n/)
    state.stdoutLineBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const text = line + '\n'
      dispatchEvent(targetContentsId, {
        type: 'log',
        jobId,
        stream: 'stdout',
        data: text
      })
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    const state = jobStates.get(jobId)
    const data = chunk.toString()

    if (!state) {
      dispatchEvent(targetContentsId, {
        type: 'log',
        jobId,
        stream: 'stderr',
        data
      })
      return
    }

    if (!state.sessionId) {
      state.stderrBuffer += data
      const match = state.stderrBuffer.match(/session id:\s*([0-9a-fA-F-]+)/i)
      if (match && match[1]) {
        state.sessionId = match[1]
        dispatchEvent(targetContentsId, {
          type: 'session',
          jobId,
          sessionId: state.sessionId
        } as AgentEvent)
      }
    }

    // Append to per-job stderr line buffer and emit complete lines
    const buffer = state.stderrLineBuffer + data
    const lines = buffer.split(/\r?\n/)
    state.stderrLineBuffer = lines.pop() ?? ''
    for (const line of lines) {
      const text = line + '\n'
      dispatchEvent(targetContentsId, {
        type: 'log',
        jobId,
        stream: 'stderr',
        data: text
      })
    }
  })

  child.on('error', (error) => {
    dispatchEvent(targetContentsId, {
      type: 'error',
      jobId,
      message: isErrorLike(error) ? error.message : `${agent} process error`
    })
    notifyRunResult(targetContentsId, {
      ok: false,
      durationMs: undefined,
      code: undefined,
      cwd: repoRoot
    })
  })

  child.on('close', (code, signal) => {
    const state = jobStates.get(jobId)

    // Flush any remaining partial lines so they are not lost
    if (state) {
      if (state.stdoutLineBuffer) {
        dispatchEvent(targetContentsId, {
          type: 'log',
          jobId,
          stream: 'stdout',
          data: state.stdoutLineBuffer
        })
      }
      if (state.stderrLineBuffer) {
        dispatchEvent(targetContentsId, {
          type: 'log',
          jobId,
          stream: 'stderr',
          data: state.stderrLineBuffer
        })
      }
    }

    runningProcesses.delete(jobId)
    jobStates.delete(jobId)
    dispatchEvent(targetContentsId, {
      type: 'exit',
      jobId,
      code,
      signal,
      durationMs: Date.now() - startedAt
    })
    notifyRunResult(targetContentsId, {
      ok: (code ?? 1) === 0,
      durationMs: Date.now() - startedAt,
      code: code ?? undefined,
      cwd: repoRoot
    })
  })

  try {
    child.stdin.write(prompt)
    child.stdin.end()
  } catch (err) {
    dispatchEvent(targetContentsId, {
      type: 'error',
      jobId,
      message: err instanceof Error ? err.message : `Failed to pass prompt to ${agent}`
    })
    try {
      child.kill()
    } catch {
      // ignored - process may already be dead
    }
  }

  return { jobId }
}

export function cancelCodex(jobId: string): { ok: boolean } {
  // 先尝试在 codex 进程中取消
  const child = runningProcesses.get(jobId)
  if (child) {
    try {
      const killed = child.kill()
      return { ok: killed }
    } catch {
      return { ok: false }
    }
  }
  // 否则尝试在 claudecode 进程中取消
  return cancelClaudeCode(jobId)
}
