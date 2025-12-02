import { webContents, Notification, BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { RunnerEvent, RunnerRunOptions } from '../../../shared/types/webui'
import { resolveProjectRoot } from '../../rpc'
import { isErrorLike } from '../../../shared/utils/errorLike'
import { buildCodexArgs } from './cli'
import { findExecutable, RUNNER_CONFIGS } from '../detect'
import { runClaudeCodeSDKStreaming, cancelClaudeCodeSDK } from '../claudecode-sdk'
import { isAgentSDKRunner } from '../../../shared/runners'

type ExecRunner = NonNullable<RunnerRunOptions['runner']>

const runningProcesses = new Map<string, ChildProcessWithoutNullStreams>()

interface CodexJobState {
  stderrBuffer: string
  stdoutLineBuffer: string
  stderrLineBuffer: string
  /** Runner CLI 上下文标识 */
  contextId?: string
}

const jobStates = new Map<string, CodexJobState>()

function getWebContents(targetId: number): WebContents | null {
  const contents = webContents.fromId(targetId)
  return contents ?? null
}

import { notifyCodex } from '../../notifyBridge'

function dispatchEvent(targetId: number, payload: RunnerEvent): void {
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
  payload: RunnerRunOptions
): Promise<{ traceId: string }> {
  const prompt = payload?.prompt?.trim()
  if (!prompt) {
    throw new Error('Prompt is required to run codex')
  }

  const runner: ExecRunner = (payload.runner as ExecRunner) ?? 'codex'

  // 所有 claude-code 相关 runner 都使用 Agent SDK 模式
  if (isAgentSDKRunner(runner)) {
    return runClaudeCodeSDKStreaming(targetContentsId, payload)
  }

  // 以下是 Codex / kimi-cli 原生 CLI 逻辑
  const traceId =
    typeof payload?.traceId === 'string' && payload.traceId.length > 0
      ? payload.traceId
      : randomUUID()
  const repoRoot = await resolveProjectRoot(payload?.projectId)
  const bin = await findExecutable(runner)
  const args =
    runner === 'codex'
      ? buildCodexArgs({ extraArgs: payload?.extraArgs, contextId: payload?.contextId })
      : Array.isArray(payload?.extraArgs)
        ? payload!.extraArgs!.filter((s) => typeof s === 'string' && s.length > 0)
        : []

  // 构建环境变量
  const runnerConfig = RUNNER_CONFIGS[runner]
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' }
  if (runnerConfig.baseUrl) {
    env.ANTHROPIC_BASE_URL = runnerConfig.baseUrl
  }

  // Print final command to the terminal for debugging
  try {
    const cmdStr = [bin, ...args].join(' ')
    console.log(`[rantcode][${runner}] spawn:`, cmdStr, '\n cwd:', repoRoot)
  } catch {
    // ignored - debug logging is non-critical
  }

  const child = spawn(bin, args, {
    cwd: repoRoot,
    env,
    stdio: 'pipe'
  })

  jobStates.set(traceId, {
    stderrBuffer: '',
    stdoutLineBuffer: '',
    stderrLineBuffer: '',
    contextId: payload.contextId
  })
  runningProcesses.set(traceId, child)

  const startedAt = Date.now()
  dispatchEvent(targetContentsId, {
    type: 'start',
    traceId,
    command: [bin, ...args],
    cwd: repoRoot
  })

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    const state = jobStates.get(traceId)
    const data = chunk.toString()

    if (!state) {
      dispatchEvent(targetContentsId, {
        type: 'log',
        traceId,
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
        traceId,
        stream: 'stdout',
        data: text
      })
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    const state = jobStates.get(traceId)
    const data = chunk.toString()

    if (!state) {
      dispatchEvent(targetContentsId, {
        type: 'log',
        traceId,
        stream: 'stderr',
        data
      })
      return
    }

    if (!state.contextId) {
      state.stderrBuffer += data
      // 从 Codex CLI 输出中提取上下文标识 (session id)
      const match = state.stderrBuffer.match(/session id:\s*([0-9a-fA-F-]+)/i)
      if (match && match[1]) {
        state.contextId = match[1]
        dispatchEvent(targetContentsId, {
          type: 'context',
          traceId,
          contextId: state.contextId
        } as RunnerEvent)
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
        traceId,
        stream: 'stderr',
        data: text
      })
    }
  })

  child.on('error', (error) => {
    dispatchEvent(targetContentsId, {
      type: 'error',
      traceId,
      message: isErrorLike(error) ? error.message : `${runner} process error`
    })
    notifyRunResult(targetContentsId, {
      ok: false,
      durationMs: undefined,
      code: undefined,
      cwd: repoRoot
    })
  })

  child.on('close', (code, signal) => {
    const state = jobStates.get(traceId)

    // Flush any remaining partial lines so they are not lost
    if (state) {
      if (state.stdoutLineBuffer) {
        dispatchEvent(targetContentsId, {
          type: 'log',
          traceId,
          stream: 'stdout',
          data: state.stdoutLineBuffer
        })
      }
      if (state.stderrLineBuffer) {
        dispatchEvent(targetContentsId, {
          type: 'log',
          traceId,
          stream: 'stderr',
          data: state.stderrLineBuffer
        })
      }
    }

    runningProcesses.delete(traceId)
    jobStates.delete(traceId)
    dispatchEvent(targetContentsId, {
      type: 'exit',
      traceId,
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
      traceId,
      message: err instanceof Error ? err.message : `Failed to pass prompt to ${runner}`
    })
    try {
      child.kill()
    } catch {
      // ignored - process may already be dead
    }
  }

  return { traceId }
}

export function cancelCodex(traceId: string): { ok: boolean } {
  // 先尝试在 codex / kimi-cli 进程中取消
  const child = runningProcesses.get(traceId)
  if (child) {
    try {
      const killed = child.kill()
      return { ok: killed }
    } catch {
      return { ok: false }
    }
  }

  // 尝试在 Agent SDK runner 中取消
  return cancelClaudeCodeSDK(traceId)
}
