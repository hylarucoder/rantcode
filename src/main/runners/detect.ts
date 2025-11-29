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
  'claude-code': {
    binaries: isWin
      ? ['claude-code.exe', 'claude.exe', 'claude-code', 'claude']
      : ['claude-code', 'claude'],
    envOverride: 'CLAUDE_CODE_BIN',
    displayName: 'Claude Code'
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

  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  for (const bin of config.binaries) {
    for (const entry of pathEntries) {
      const candidate = path.join(entry, bin)
      try {
        await fs.access(candidate, fsConstants.X_OK)
        return candidate
      } catch {
        continue
      }
    }
  }
  throw new Error(
    `${config.displayName} not found on PATH. You can set ${config.envOverride} to its absolute path.`
  )
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
