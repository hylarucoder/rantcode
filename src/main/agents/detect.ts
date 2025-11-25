import path from 'node:path'
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { spawn } from 'node:child_process'

export type Engine = 'codex' | 'claude-code' | 'kimi-cli'

const CODEX_BINARIES =
  process.platform === 'win32'
    ? ['codex.exe', 'openai-codex.exe', 'codex', 'openai-codex']
    : ['codex', 'openai-codex']

const CLAUDE_CODE_BINARIES =
  process.platform === 'win32'
    ? ['claude-code.exe', 'claude.exe', 'claude-code', 'claude']
    : ['claude-code', 'claude']

const KIMI_CLI_BINARIES =
  process.platform === 'win32'
    ? ['kimi-cli.exe', 'kimi.exe', 'moonshot.exe', 'kimi-cli', 'kimi', 'moonshot']
    : ['kimi-cli', 'kimi', 'moonshot']

export interface DetectResult {
  name: Engine
  executablePath?: string
  version?: string
}

export async function findExecutable(engine: Engine): Promise<string> {
  const overrideEnv =
    engine === 'codex' ? 'CODEX_BIN' : engine === 'claude-code' ? 'CLAUDE_CODE_BIN' : 'KIMI_CLI_BIN'
  const override = (process.env[overrideEnv] || '').trim()
  if (override) {
    try {
      await fs.access(override, fsConstants.X_OK)
      return override
    } catch {
      // fallthrough to PATH scan
    }
  }

  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const candidates =
    engine === 'codex'
      ? CODEX_BINARIES
      : engine === 'claude-code'
        ? CLAUDE_CODE_BINARIES
        : KIMI_CLI_BINARIES
  for (const bin of candidates) {
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
  const name = engine === 'codex' ? 'Codex' : engine === 'claude-code' ? 'Claude Code' : 'Kimi CLI'
  throw new Error(`${name} not found on PATH. You can set ${overrideEnv} to its absolute path.`)
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

export async function detect(engine: Engine): Promise<DetectResult> {
  try {
    const bin = await findExecutable(engine)
    const version = await getVersion(bin)
    return { name: engine, executablePath: bin, version }
  } catch {
    return { name: engine }
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
