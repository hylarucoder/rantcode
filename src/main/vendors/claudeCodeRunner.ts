import { spawn } from 'node:child_process'
import * as fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { z } from 'zod'
import { claudeVendorRunInputSchema } from '../../shared/orpc/schemas'

export type ClaudeRunInput = z.infer<typeof claudeVendorRunInputSchema>
export interface ClaudeRunResult {
  ok: boolean
  error?: string
  output?: string
  command?: string
}

export async function runClaudeOnce(input: ClaudeRunInput): Promise<ClaudeRunResult> {
  const cfg = input.config
  try {
    await fs.access(cfg.binPath, fsConstants.X_OK)
  } catch (err) {
    const msg = (err as { message?: string })?.message || 'Binary not accessible'
    return { ok: false, error: msg }
  }

  const args = Array.isArray(cfg.args) ? cfg.args.slice() : []
  // Default flags for non-interactive, verbose JSON streaming runs
  if (!args.includes('--print') && !args.includes('-p')) args.push('--print')
  if (!args.includes('--dangerously-skip-permissions'))
    args.unshift('--dangerously-skip-permissions')
  if (!args.includes('--output-format')) args.push('--output-format', 'stream-json')
  if (!args.includes('--verbose')) args.push('--verbose')

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

  let out = ''
  let errOut = ''
  let gotInit = false
  let gotNonInit = false
  const processOutChunk = (chunk: string) => {
    const text = String(chunk)
    out += text
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
      resolve({
        ok: !onlyInit,
        error: onlyInit
          ? '在 10s 内没有在 init 之后产生输出，可能是 Token 无效或网络阻塞。'
          : undefined,
        output: out || errOut,
        command: printable
      })
    }, 10000)
    child.on('close', (code) => {
      clearTimeout(timer)
      const onlyInit = gotInit && !gotNonInit
      const ok = (code ?? 0) === 0 && !onlyInit
      resolve({
        ok,
        output: out || errOut,
        error: ok ? undefined : onlyInit ? 'init 之后无输出（可能凭证错误）' : `exit ${code}`,
        command: printable
      })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({
        ok: false,
        error: (e as { message?: string })?.message || 'spawn error',
        output: out || errOut,
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
