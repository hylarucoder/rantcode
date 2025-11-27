import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import * as fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { claudeVendorRunInputSchema } from '../../../shared/orpc/schemas'
import type { CodexEvent, CodexRunOptions } from '../../../shared/types/webui'
import { notifyCodex } from '../../notifyBridge'
import { findExecutable, AGENT_CONFIGS } from '../detect'
import type { Agent } from '../../../shared/agents'
import { resolveProjectRoot } from '../../rpc'
import { readClaudeTokens, type ClaudeTokens } from '../../settings/tokens'

export type ClaudeRunInput = z.infer<typeof claudeVendorRunInputSchema>
export interface ClaudeRunResult {
  ok: boolean
  error?: string
  output?: string
  command?: string
}

// Claude Code JSON Lines 消息类型
interface ClaudeJsonMessage {
  type?: string
  subtype?: string
  message?: {
    content?: Array<{ type: string; text?: string }>
  }
  result?: string
  session_id?: string
}

// 从 Claude Code 的 JSON Lines 消息中提取文本
function extractTextFromClaudeMessage(json: ClaudeJsonMessage): string | null {
  // assistant 消息：提取 message.content 中的 text
  if (json.type === 'assistant' && json.message?.content) {
    const textParts = json.message.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
    if (textParts.length > 0) {
      return textParts.join('\n')
    }
  }
  // result 消息：提取 result 字段
  if (json.type === 'result' && json.result) {
    return json.result
  }
  return null
}

// 流式运行状态
interface ClaudeCodeJobState {
  stderrBuffer: string
  stdoutLineBuffer: string
  stderrLineBuffer: string
  sessionId?: string
  accumulatedText: string
}

const runningProcesses = new Map<string, ChildProcessWithoutNullStreams>()
const jobStates = new Map<string, ClaudeCodeJobState>()

function dispatchEvent(targetId: number, payload: CodexEvent): void {
  notifyCodex(targetId, payload)
}

/**
 * 构建 Claude Code CLI 的默认参数
 * 确保包含 --print, --dangerously-skip-permissions, --output-format stream-json, --verbose
 * 如果提供了 sessionId，添加 --resume 参数以恢复会话
 */
function buildClaudeCodeArgs(extraArgs?: string[], sessionId?: string): string[] {
  const args = Array.isArray(extraArgs)
    ? extraArgs.filter((s) => typeof s === 'string' && s.length > 0)
    : []

  // 添加默认标志（如果尚未存在）
  if (!args.includes('--print') && !args.includes('-p')) {
    args.push('--print')
  }
  if (!args.includes('--dangerously-skip-permissions')) {
    args.unshift('--dangerously-skip-permissions')
  }
  if (!args.includes('--output-format')) {
    args.push('--output-format', 'stream-json')
  }
  if (!args.includes('--verbose')) {
    args.push('--verbose')
  }

  // 如果有 sessionId，添加 --resume 参数以恢复会话上下文
  if (sessionId && !args.includes('--resume') && !args.includes('-r')) {
    args.push('--resume', sessionId)
  }

  return args
}

/**
 * 流式运行 Claude Code agent，实时发送事件到渲染进程
 */
export async function runClaudeCodeStreaming(
  targetContentsId: number,
  payload: CodexRunOptions
): Promise<{ jobId: string }> {
  const prompt = payload?.prompt?.trim()
  if (!prompt) {
    throw new Error('Prompt is required to run Claude Code')
  }

  const jobId =
    typeof payload?.jobId === 'string' && payload.jobId.length > 0 ? payload.jobId : randomUUID()
  const repoRoot = await resolveProjectRoot(payload?.projectId)
  const agent = payload.agent as Agent

  const bin = await findExecutable(agent)
  const agentConfig = AGENT_CONFIGS[agent]
  // 如果有 sessionId，使用 --resume 恢复会话上下文
  const args = buildClaudeCodeArgs(payload.extraArgs, payload.sessionId)

  // 构建环境变量
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' }
  if (agentConfig.baseUrl) {
    env.ANTHROPIC_BASE_URL = agentConfig.baseUrl
  }

  // 读取并设置 API token
  if (agentConfig.tokenEnvKey) {
    const tokens = await readClaudeTokens()
    const tokenValue = tokens[agentConfig.tokenEnvKey as keyof ClaudeTokens]
    if (tokenValue) {
      env.ANTHROPIC_API_KEY = tokenValue
      env.ANTHROPIC_AUTH_TOKEN = tokenValue
    }
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
    sessionId: payload.sessionId,
    accumulatedText: ''
  })
  runningProcesses.set(jobId, child)

  const startedAt = Date.now()
  dispatchEvent(targetContentsId, {
    type: 'start',
    jobId,
    command: [bin, ...args],
    cwd: repoRoot
  })

  // 处理 stdout：解析 JSON Lines
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

    // 按行处理
    const buffer = state.stdoutLineBuffer + data
    const lines = buffer.split(/\r?\n/)
    state.stdoutLineBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine) {
        try {
          const json = JSON.parse(trimmedLine) as ClaudeJsonMessage

          // 提取 session_id
          if (json.session_id && !state.sessionId) {
            state.sessionId = json.session_id
            dispatchEvent(targetContentsId, {
              type: 'session',
              jobId,
              sessionId: json.session_id
            })
          }

          // 提取文本内容
          const extractedText = extractTextFromClaudeMessage(json)
          if (extractedText) {
            // 发送流式文本事件
            dispatchEvent(targetContentsId, {
              type: 'text',
              jobId,
              text: extractedText,
              delta: false
            })
          }

          // 发送原始消息用于调试
          dispatchEvent(targetContentsId, {
            type: 'claude_message',
            jobId,
            messageType:
              (json.type as 'init' | 'assistant' | 'result' | 'user' | 'system') || 'system',
            content: extractedText || undefined,
            raw: json
          })
        } catch {
          // 解析失败，当作普通文本处理
        }
      }

      // 始终发送日志事件
      const text = line + '\n'
      dispatchEvent(targetContentsId, {
        type: 'log',
        jobId,
        stream: 'stdout',
        data: text
      })
    }
  })

  // 处理 stderr
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

    // 按行处理
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
      message: error instanceof Error ? error.message : 'Claude Code process error'
    })
  })

  child.on('close', (code, signal) => {
    const state = jobStates.get(jobId)

    // Flush remaining partial lines
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
  })

  // 写入 prompt
  try {
    child.stdin.write(prompt)
    child.stdin.end()
  } catch (err) {
    dispatchEvent(targetContentsId, {
      type: 'error',
      jobId,
      message: err instanceof Error ? err.message : 'Failed to pass prompt to Claude Code'
    })
    try {
      child.kill()
    } catch {
      // ignored - process may already be dead
    }
  }

  return { jobId }
}

/**
 * 取消正在运行的 Claude Code 任务
 */
export function cancelClaudeCode(jobId: string): { ok: boolean } {
  const child = runningProcesses.get(jobId)
  if (!child) return { ok: false }
  try {
    const killed = child.kill()
    return { ok: killed }
  } catch {
    return { ok: false }
  }
}

/**
 * 从 JSON Lines 输出中提取可读的文本内容
 * 注意：Claude Code 输出中 assistant 和 result 消息内容相同，只取一个避免重复
 */
function parseClaudeOutputToText(rawOutput: string): string {
  const lines = rawOutput.split(/\r?\n/)
  let resultText: string | null = null
  let lastAssistantText: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    try {
      const json = JSON.parse(trimmed) as ClaudeJsonMessage

      // 跳过 init 消息
      if (json.type === 'system' && json.subtype === 'init') {
        continue
      }

      // 优先使用 result 消息（最终结果）
      if (json.type === 'result' && json.result) {
        resultText = json.result
      }
      // 备用：记录最后一个 assistant 消息（只保留最后一个，避免重复）
      else if (json.type === 'assistant' && json.message?.content) {
        const textParts = json.message.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
        if (textParts.length > 0) {
          lastAssistantText = textParts.join('\n')
        }
      }
    } catch {
      // 非 JSON 行，忽略
    }
  }

  // 优先返回 result，否则返回最后一个 assistant 消息
  if (resultText) {
    return resultText
  }
  if (lastAssistantText) {
    return lastAssistantText
  }
  return ''
}

export async function runClaudeOnce(input: ClaudeRunInput): Promise<ClaudeRunResult> {
  const cfg = input.config
  try {
    await fs.access(cfg.binPath, fsConstants.X_OK)
  } catch (err) {
    const msg = (err as { message?: string })?.message || 'Binary not accessible'
    return { ok: false, error: msg }
  }

  const args = buildClaudeCodeArgs(cfg.args)

  // Build final env
  const finalEnv: NodeJS.ProcessEnv = { ...process.env, ...cfg.envVars, NO_COLOR: '1' }
  const vendorKey = (cfg as { vendorKey?: string }).vendorKey
  const tokenVar =
    vendorKey === 'kimi'
      ? 'KIMI_API_KEY'
      : vendorKey === 'glm'
        ? 'ZHIPU_API_KEY'
        : vendorKey === 'minmax'
          ? 'MINMAX_API_KEY'
          : 'ANTHROPIC_API_KEY'
  const tokenVal = finalEnv[tokenVar] as string | undefined
  if (tokenVal) {
    if (!finalEnv.ANTHROPIC_API_KEY) finalEnv.ANTHROPIC_API_KEY = tokenVal as string
    if (!finalEnv.ANTHROPIC_AUTH_TOKEN) finalEnv.ANTHROPIC_AUTH_TOKEN = tokenVal as string
  }
  if (!finalEnv.ANTHROPIC_BASE_URL) {
    if (vendorKey === 'glm') finalEnv.ANTHROPIC_BASE_URL = 'https://open.bigmodel.cn/api/anthropic'
    if (vendorKey === 'kimi') finalEnv.ANTHROPIC_BASE_URL = 'https://api.moonshot.cn/anthropic'
  }
  if (cfg.modelPrimary && !finalEnv.ANTHROPIC_MODEL) finalEnv.ANTHROPIC_MODEL = cfg.modelPrimary
  if (cfg.modelFast && !finalEnv.ANTHROPIC_SMALL_FAST_MODEL)
    finalEnv.ANTHROPIC_SMALL_FAST_MODEL = cfg.modelFast

  const argv = cfg.promptMode === 'arg' ? [...args, input.prompt] : args
  const child = spawn(cfg.binPath, argv, {
    env: finalEnv,
    stdio: cfg.promptMode === 'stdin' ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe']
  })
  if (cfg.promptMode === 'stdin') {
    try {
      child.stdin?.write(input.prompt)
      child.stdin?.end()
    } catch {
      /* ignore */
    }
  }

  let rawOut = ''
  let errOut = ''
  let gotInit = false
  let gotNonInit = false
  const processOutChunk = (chunk: string) => {
    const text = String(chunk)
    rawOut += text
    try {
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim()
        if (!t) continue
        try {
          const json = JSON.parse(t) as { type?: string; subtype?: string }
          if (json && json.type === 'system' && json.subtype === 'init') {
            gotInit = true
            continue
          }
        } catch {
          // not JSON line; treat as non-init if it has content
        }
        gotNonInit = true
      }
    } catch {
      /* ignore parse error */
    }
  }
  if (child.stdout) {
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d) => processOutChunk(String(d)))
  }
  if (child.stderr) {
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (d) => (errOut += String(d)))
  }

  // Build printable command; mask token
  const envAssigns: string[] = []
  if (tokenVal) envAssigns.push(`ANTHROPIC_AUTH_TOKEN=******`)
  if (finalEnv.ANTHROPIC_BASE_URL)
    envAssigns.push(`ANTHROPIC_BASE_URL=${finalEnv.ANTHROPIC_BASE_URL}`)
  if (finalEnv.ANTHROPIC_SMALL_FAST_MODEL)
    envAssigns.push(`ANTHROPIC_SMALL_FAST_MODEL=${finalEnv.ANTHROPIC_SMALL_FAST_MODEL}`)
  if (finalEnv.ANTHROPIC_MODEL) envAssigns.push(`ANTHROPIC_MODEL=${finalEnv.ANTHROPIC_MODEL}`)
  const argvPrintable =
    cfg.promptMode === 'arg'
      ? [cfg.binPath, ...args, JSON.stringify(input.prompt)].join(' ')
      : `${cfg.binPath} ${args.join(' ')} <stdin>`
  const printable = `${envAssigns.join(' ')} ${argvPrintable}`.trim()
  try {
    console.log(`[claudeCode] runOnce: ${printable}`)
  } catch {}

  return await new Promise<ClaudeRunResult>((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {}
      const onlyInit = gotInit && !gotNonInit
      // 解析 JSON Lines 输出为可读文本
      const parsedOutput = parseClaudeOutputToText(rawOut)
      resolve({
        ok: !onlyInit,
        error: onlyInit
          ? '在 10s 内没有在 init 之后产生输出，可能是 Token 无效或网络阻塞。'
          : undefined,
        output: parsedOutput || errOut,
        command: printable
      })
    }, 10000)
    child.on('close', (code) => {
      clearTimeout(timer)
      const onlyInit = gotInit && !gotNonInit
      const ok = (code ?? 0) === 0 && !onlyInit
      // 解析 JSON Lines 输出为可读文本
      const parsedOutput = parseClaudeOutputToText(rawOut)
      resolve({
        ok,
        output: parsedOutput || errOut,
        error: ok ? undefined : onlyInit ? 'init 之后无输出（可能凭证错误）' : `exit ${code}`,
        command: printable
      })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      // 解析 JSON Lines 输出为可读文本
      const parsedOutput = parseClaudeOutputToText(rawOut)
      resolve({
        ok: false,
        error: (e as { message?: string })?.message || 'spawn error',
        output: parsedOutput || errOut,
        command: printable
      })
    })
  })
}

export async function testClaudeVendor(cfg: ClaudeRunInput['config']): Promise<ClaudeRunResult> {
  try {
    await fs.access(cfg.binPath, fsConstants.X_OK)
  } catch (err) {
    const msg = (err as { message?: string })?.message || 'Binary not accessible'
    return { ok: false, error: msg }
  }
  const args = Array.isArray(cfg.args) ? cfg.args.slice() : []
  const testArgs = args.includes('--version') ? args : [...args, '--version']
  if (!testArgs.includes('--dangerously-skip-permissions'))
    testArgs.unshift('--dangerously-skip-permissions')
  const child = spawn(cfg.binPath, testArgs, {
    env: { ...process.env, ...cfg.envVars, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let out = ''
  let errOut = ''
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (d) => (out += String(d)))
  child.stderr?.on('data', (d) => (errOut += String(d)))
  const cmdStr = [cfg.binPath, ...testArgs].join(' ')
  return await new Promise<ClaudeRunResult>((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {}
      resolve({ ok: true, output: out || errOut, command: cmdStr })
    }, 1500)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        ok: (code ?? 0) === 0,
        output: out || errOut,
        error: (code ?? 0) === 0 ? undefined : `exit ${code}`,
        command: cmdStr
      })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({
        ok: false,
        error: (e as { message?: string })?.message || 'spawn error',
        output: out || errOut,
        command: cmdStr
      })
    })
  })
}
