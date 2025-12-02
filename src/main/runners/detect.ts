import path from 'node:path'
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { spawn } from 'node:child_process'
import type { Runner } from '../../shared/runners'

export type { Runner }

/** Runner 配置：二进制文件候选、环境变量覆盖、显示名称、API 基础 URL */
interface RunnerConfig {
  binaries: string[]
  envOverride: string
  displayName: string
  baseUrl?: string
  tokenEnvKey?: string
}

const isWin = process.platform === 'win32'

const RUNNER_CONFIGS: Record<Runner, RunnerConfig> = {
  codex: {
    binaries: isWin
      ? ['codex.exe', 'openai-codex.exe', 'codex', 'openai-codex']
      : ['codex', 'openai-codex'],
    envOverride: 'CODEX_BIN',
    displayName: 'Codex'
  },
  // 所有 claude-code 相关 runner 都使用 Agent SDK 模式
  'claude-code': {
    binaries: isWin
      ? ['claude-code.exe', 'claude.exe', 'claude-code', 'claude']
      : ['claude-code', 'claude'],
    envOverride: 'CLAUDE_CODE_BIN',
    displayName: 'Claude Code',
    tokenEnvKey: 'official'
  },
  'claude-code-glm': {
    binaries: isWin
      ? ['claude-code.exe', 'claude.exe', 'claude-code', 'claude']
      : ['claude-code', 'claude'],
    envOverride: 'CLAUDE_CODE_BIN',
    displayName: 'Claude Code (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    tokenEnvKey: 'glm'
  },
  'claude-code-kimi': {
    binaries: isWin
      ? ['claude-code.exe', 'claude.exe', 'claude-code', 'claude']
      : ['claude-code', 'claude'],
    envOverride: 'CLAUDE_CODE_BIN',
    displayName: 'Claude Code (Kimi)',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    tokenEnvKey: 'kimi'
  },
  'claude-code-minimax': {
    binaries: isWin
      ? ['claude-code.exe', 'claude.exe', 'claude-code', 'claude']
      : ['claude-code', 'claude'],
    envOverride: 'CLAUDE_CODE_BIN',
    displayName: 'Claude Code (MiniMax)',
    baseUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    tokenEnvKey: 'minmax'
  },
  'kimi-cli': {
    binaries: isWin
      ? ['kimi-cli.exe', 'kimi.exe', 'moonshot.exe', 'kimi-cli', 'kimi', 'moonshot']
      : ['kimi-cli', 'kimi', 'moonshot'],
    envOverride: 'KIMI_CLI_BIN',
    displayName: 'Kimi CLI'
  }
}

export { RUNNER_CONFIGS }

// 兼容性导出
/** @deprecated 使用 RUNNER_CONFIGS 代替 */
export const AGENT_CONFIGS = RUNNER_CONFIGS

export interface DetectResult {
  name: Runner
  executablePath?: string
  version?: string
}

export async function findExecutable(runner: Runner): Promise<string> {
  const config = RUNNER_CONFIGS[runner]
  const override = (process.env[config.envOverride] || '').trim()
  if (override) {
    try {
      await fs.access(override, fsConstants.X_OK)
      return override
    } catch {
      // fallthrough to PATH scan
    }
  }

  // 获取用户 home 目录
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''

  // 额外的搜索路径（Electron 进程的 PATH 可能不包含这些）
  const extraPaths: string[] = []
  if (homeDir) {
    // Claude Code 默认安装路径
    extraPaths.push(path.join(homeDir, '.claude', 'local'))
    extraPaths.push(path.join(homeDir, '.local', 'bin'))
  }

  const pathEntries = [
    ...extraPaths,
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean)
  ]

  for (const bin of config.binaries) {
    for (const entry of pathEntries) {
      const candidate = path.join(entry, bin)
      try {
        await fs.access(candidate, fsConstants.X_OK)
        // 检查是否是 bash wrapper 脚本，如果是则尝试找到真正的 JS 可执行文件
        // Agent SDK 期望 .js 文件以便使用 node 来运行，而不是直接执行 bash 脚本
        const realExecutable = await resolveRealExecutable(candidate)
        return realExecutable
      } catch {
        continue
      }
    }
  }
  throw new Error(
    `${config.displayName} not found on PATH. You can set ${config.envOverride} to its absolute path.`
  )
}

/**
 * 解析真正的可执行文件路径
 * 如果给定的路径是一个 bash wrapper 脚本（如 ~/.claude/local/claude），
 * 则尝试找到它指向的真正 JS 可执行文件。
 * 这对于 Agent SDK 很重要，因为 SDK 会根据文件扩展名判断是否使用 node 来运行。
 */
async function resolveRealExecutable(candidate: string): Promise<string> {
  try {
    // 读取文件的前几行来检查是否是 shell 脚本
    const content = await fs.readFile(candidate, 'utf8')
    const firstLine = content.split('\n')[0]

    // 如果是 bash/sh 脚本
    if (firstLine.startsWith('#!') && (firstLine.includes('bash') || firstLine.includes('/sh'))) {
      // 检查是否是 ~/.claude/local/claude 这样的 wrapper
      // 它通常会 exec 到 node_modules/.bin/claude
      const dir = path.dirname(candidate)
      const possibleJsPaths = [
        path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
        path.join(dir, 'node_modules', '.bin', 'claude')
      ]

      for (const jsPath of possibleJsPaths) {
        try {
          await fs.access(jsPath, fsConstants.X_OK)
          // 如果找到 cli.js，优先返回它（SDK 会识别 .js 并使用 node 执行）
          if (jsPath.endsWith('.js')) {
            return jsPath
          }
        } catch {
          continue
        }
      }
    }
  } catch {
    // 读取文件失败，可能是二进制文件，直接返回原路径
  }

  return candidate
}

async function getVersion(executablePath: string): Promise<string | undefined> {
  const tryArgsList: string[][] = [['--version'], ['version'], ['-v']]
  for (const args of tryArgsList) {
    const out = await trySpawnForVersion(executablePath, args)
    if (out) return out
  }
  return undefined
}

async function trySpawnForVersion(bin: string, args: string[]): Promise<string | undefined> {
  try {
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' }
    })
    let out = ''
    let errOut = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d) => (out += String(d)))
    child.stderr.on('data', (d) => (errOut += String(d)))
    const result: string | undefined = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {}
        const text = (out || errOut || '').trim()
        resolve(text || undefined)
      }, 1500)
      child.on('close', () => {
        clearTimeout(timer)
        const text = (out || errOut || '').trim()
        resolve(text || undefined)
      })
      child.on('error', () => {
        clearTimeout(timer)
        resolve(undefined)
      })
    })
    return result
  } catch {
    return undefined
  }
}

export async function detect(runner: Runner): Promise<DetectResult> {
  try {
    const bin = await findExecutable(runner)
    const version = await getVersion(bin)
    return { name: runner, executablePath: bin, version }
  } catch {
    return { name: runner }
  }
}

export async function detectAll(): Promise<{
  codex: DetectResult
  claudeCode: DetectResult
  kimiCli: DetectResult
}> {
  const [codex, claudeCode, kimiCli] = await Promise.all([
    detect('codex'),
    detect('claude-code'),
    detect('kimi-cli')
  ])
  return { codex, claudeCode, kimiCli }
}
