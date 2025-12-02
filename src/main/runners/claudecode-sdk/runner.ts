/**
 * Claude Code SDK Runner
 *
 * 基于官方 @anthropic-ai/claude-agent-sdk 的实现
 * 相比 CLI spawn 方式，提供更好的类型安全和更丰富的功能
 */
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import type { RunnerEvent, RunnerRunOptions } from '../../../shared/types/webui'
import { notifyCodex } from '../../notifyBridge'
import { findExecutable, RUNNER_CONFIGS } from '../detect'
import type { Runner } from '../../../shared/runners'
import { resolveProjectRoot } from '../../rpc'
import { readClaudeTokens, type ClaudeTokens } from '../../settings/tokens'

// 正在运行的查询，用于取消操作
const runningQueries = new Map<
  string,
  {
    abortController: AbortController
    query: ReturnType<typeof query>
  }
>()

function dispatchEvent(targetId: number, payload: RunnerEvent): void {
  notifyCodex(targetId, payload)
}

/**
 * 从 SDK 消息中提取文本内容
 */
function extractTextFromSDKMessage(message: SDKMessage): string | null {
  // assistant 消息
  if (message.type === 'assistant' && 'message' in message) {
    const content = message.message?.content
    if (Array.isArray(content)) {
      const textParts = content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && 'text' in c)
        .map((c) => c.text)
      if (textParts.length > 0) {
        return textParts.join('\n')
      }
    }
  }

  // result 消息
  if (message.type === 'result' && 'result' in message) {
    return message.result as string
  }

  return null
}

/**
 * 查找 node 可执行文件并构建扩展的 PATH
 * Electron 应用的 PATH 通常不完整，需要确保 node 可用
 */
async function buildExtendedPath(): Promise<string> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const existingPath = process.env.PATH || ''
  const delimiter = process.platform === 'win32' ? ';' : ':'
  const isWin = process.platform === 'win32'

  // 常见的 node 安装路径
  const nodePaths: string[] = []
  if (homeDir) {
    // volta
    nodePaths.push(`${homeDir}/.volta/bin`)
    // homebrew on macOS
    nodePaths.push('/opt/homebrew/bin')
    nodePaths.push('/usr/local/bin')
    // asdf
    nodePaths.push(`${homeDir}/.asdf/shims`)
    // 通用 local bin
    nodePaths.push(`${homeDir}/.local/bin`)
    // nvm - 尝试找到当前版本
    const nvmDir = `${homeDir}/.nvm/versions/node`
    try {
      const { readdirSync } = await import('node:fs')
      const versions = readdirSync(nvmDir)
        .filter((v) => v.startsWith('v'))
        .sort()
        .reverse()
      if (versions.length > 0) {
        nodePaths.push(`${nvmDir}/${versions[0]}/bin`)
      }
    } catch {
      /* nvm not installed */
    }

    // fnm - 动态路径，尝试找到活跃的 multishell
    const fnmDir = `${homeDir}/.local/state/fnm_multishells`
    try {
      const { readdirSync, statSync } = await import('node:fs')
      const shells = readdirSync(fnmDir)
        .map((name) => ({ name, mtime: statSync(`${fnmDir}/${name}`).mtime.getTime() }))
        .sort((a, b) => b.mtime - a.mtime)
      if (shells.length > 0) {
        nodePaths.push(`${fnmDir}/${shells[0].name}/bin`)
      }
    } catch {
      /* fnm not installed */
    }
  }

  // 添加 /usr/bin 作为后备
  nodePaths.push('/usr/bin')

  // 验证哪些路径包含 node
  const validNodePaths: string[] = []
  const nodeNames = isWin ? ['node.exe', 'node.cmd', 'node'] : ['node']
  const { accessSync, constants: fsConstants } = await import('node:fs')
  const path = await import('node:path')

  for (const dir of nodePaths) {
    for (const nodeName of nodeNames) {
      try {
        accessSync(path.join(dir, nodeName), fsConstants.X_OK)
        validNodePaths.push(dir)
        break
      } catch {
        /* not found */
      }
    }
  }

  // 合并路径，优先使用找到 node 的路径
  const allPaths = [...validNodePaths, ...existingPath.split(delimiter)].filter(Boolean)
  // 去重
  const uniquePaths = [...new Set(allPaths)]

  return uniquePaths.join(delimiter)
}

/**
 * 构建 SDK Options
 */
async function buildSDKOptions(
  runner: Runner,
  repoRoot: string,
  contextId?: string
): Promise<Options> {
  const runnerConfig = RUNNER_CONFIGS[runner]

  // 构建环境变量，继承当前进程环境并扩展 PATH
  const extendedPath = await buildExtendedPath()
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    ),
    NO_COLOR: '1',
    PATH: extendedPath
  }

  // 设置 base URL（用于第三方供应商）
  if (runnerConfig.baseUrl) {
    env.ANTHROPIC_BASE_URL = runnerConfig.baseUrl
  }

  // 读取并设置 API token
  if (runnerConfig.tokenEnvKey) {
    const tokens = await readClaudeTokens()
    const tokenValue = tokens[runnerConfig.tokenEnvKey as keyof ClaudeTokens]
    if (tokenValue) {
      env.ANTHROPIC_API_KEY = tokenValue
      env.ANTHROPIC_AUTH_TOKEN = tokenValue
    }
  }

  // 尝试找到 claude 可执行文件路径
  let pathToClaudeCodeExecutable: string | undefined
  try {
    pathToClaudeCodeExecutable = await findExecutable(runner)
    console.log(`[rantcode][${runner}] Found executable: ${pathToClaudeCodeExecutable}`)
  } catch (err) {
    console.error(`[rantcode][${runner}] Failed to find executable:`, err)
    // 如果找不到，让 SDK 使用默认路径
  }

  const options: Options = {
    cwd: repoRoot,
    env,
    pathToClaudeCodeExecutable,
    permissionMode: 'bypassPermissions', // 等同于 --dangerously-skip-permissions
    includePartialMessages: true // 启用流式部分消息
  }

  // 如果有 contextId，恢复会话
  if (contextId) {
    options.resume = contextId
  }

  return options
}

/**
 * 使用 SDK 流式运行 Claude Code
 */
export async function runClaudeCodeSDKStreaming(
  targetContentsId: number,
  payload: RunnerRunOptions
): Promise<{ traceId: string }> {
  const prompt = payload?.prompt?.trim()
  if (!prompt) {
    throw new Error('Prompt is required to run Claude Code')
  }

  const traceId =
    typeof payload?.traceId === 'string' && payload.traceId.length > 0
      ? payload.traceId
      : randomUUID()

  const repoRoot = await resolveProjectRoot(payload?.projectId)
  const runner = payload.runner as Runner

  const abortController = new AbortController()
  const options = await buildSDKOptions(runner, repoRoot, payload.contextId)
  options.abortController = abortController

  const startedAt = Date.now()

  // 发送开始事件
  dispatchEvent(targetContentsId, {
    type: 'start',
    traceId,
    command: ['claude-agent-sdk', runner],
    cwd: repoRoot
  })

  console.log(`[rantcode][${runner}] SDK query started, cwd: ${repoRoot}`)

  try {
    const q = query({
      prompt,
      options
    })

    // 保存查询引用，用于取消
    runningQueries.set(traceId, { abortController, query: q })

    // 异步处理消息流
    ;(async () => {
      let contextId: string | undefined

      try {
        for await (const message of q) {
          // 提取 session_id 作为 contextId
          if ('session_id' in message && message.session_id && !contextId) {
            contextId = message.session_id as string
            dispatchEvent(targetContentsId, {
              type: 'context',
              traceId,
              contextId
            })
          }

          // 提取文本内容
          const extractedText = extractTextFromSDKMessage(message)
          if (extractedText) {
            dispatchEvent(targetContentsId, {
              type: 'text',
              traceId,
              text: extractedText,
              delta: false
            })
          }

          // 发送原始消息用于调试
          const messageType = message.type as
            | 'init'
            | 'assistant'
            | 'result'
            | 'user'
            | 'system'
            | string
          if (['init', 'assistant', 'result', 'user', 'system'].includes(messageType)) {
            dispatchEvent(targetContentsId, {
              type: 'claude_message',
              traceId,
              messageType: messageType as 'init' | 'assistant' | 'result' | 'user' | 'system',
              content: extractedText || undefined,
              raw: message
            })
          }

          // 发送日志事件
          dispatchEvent(targetContentsId, {
            type: 'log',
            traceId,
            stream: 'stdout',
            data: JSON.stringify(message) + '\n'
          })
        }

        // 成功完成
        runningQueries.delete(traceId)
        dispatchEvent(targetContentsId, {
          type: 'exit',
          traceId,
          code: 0,
          signal: null,
          durationMs: Date.now() - startedAt
        })
      } catch (error) {
        runningQueries.delete(traceId)

        const isAborted =
          error instanceof Error &&
          (error.name === 'AbortError' || error.message.includes('aborted'))

        if (isAborted) {
          dispatchEvent(targetContentsId, {
            type: 'exit',
            traceId,
            code: 130, // SIGINT
            signal: 'SIGINT',
            durationMs: Date.now() - startedAt
          })
        } else {
          dispatchEvent(targetContentsId, {
            type: 'error',
            traceId,
            message: error instanceof Error ? error.message : 'Unknown error'
          })
          dispatchEvent(targetContentsId, {
            type: 'exit',
            traceId,
            code: 1,
            signal: null,
            durationMs: Date.now() - startedAt
          })
        }
      }
    })()
  } catch (error) {
    runningQueries.delete(traceId)
    dispatchEvent(targetContentsId, {
      type: 'error',
      traceId,
      message: error instanceof Error ? error.message : 'Failed to start Claude Code SDK'
    })
    throw error
  }

  return { traceId }
}

/**
 * 取消正在运行的 SDK 查询
 */
export function cancelClaudeCodeSDK(traceId: string): { ok: boolean } {
  const running = runningQueries.get(traceId)
  if (!running) return { ok: false }

  try {
    running.abortController.abort()
    runningQueries.delete(traceId)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/**
 * 测试 SDK 连接（通过检测 CLI 版本）
 */
export async function testClaudeCodeSDK(runner: Runner): Promise<{
  ok: boolean
  error?: string
  version?: string
}> {
  try {
    const pathToClaudeCodeExecutable = await findExecutable(runner)

    // SDK 本身不提供版本检测，我们使用 CLI 来检测
    const { spawn } = await import('node:child_process')
    const child = spawn(pathToClaudeCodeExecutable, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' }
    })

    return await new Promise((resolve) => {
      let out = ''
      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (d) => (out += String(d)))

      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {}
        resolve({ ok: true, version: out.trim() || undefined })
      }, 1500)

      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({
          ok: code === 0,
          version: out.trim() || undefined,
          error: code === 0 ? undefined : `exit ${code}`
        })
      })

      child.on('error', (e) => {
        clearTimeout(timer)
        resolve({
          ok: false,
          error: e.message || 'spawn error'
        })
      })
    })
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to find Claude Code executable'
    }
  }
}

// ============================================================================
// 供应商配置测试函数（用于设置页面）
// ============================================================================

import { z } from 'zod'
import { claudeVendorRunInputSchema } from '../../../shared/orpc/schemas'
import * as fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { spawn } from 'node:child_process'

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

/**
 * 从 JSON Lines 输出中提取可读的文本内容
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

      if (json.type === 'system' && json.subtype === 'init') {
        continue
      }

      if (json.type === 'result' && json.result) {
        resultText = json.result
      } else if (json.type === 'assistant' && json.message?.content) {
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

  return resultText || lastAssistantText || ''
}

/**
 * 构建 Claude Code CLI 的默认参数
 */
function buildClaudeCodeArgs(extraArgs?: string[]): string[] {
  const args = Array.isArray(extraArgs)
    ? extraArgs.filter((s) => typeof s === 'string' && s.length > 0)
    : []

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

  return args
}

/**
 * 测试 Claude 供应商配置（用于设置页面）
 */
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

/**
 * 执行一次性 Claude 测试（用于设置页面测试 token）
 */
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
          // not JSON line
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
