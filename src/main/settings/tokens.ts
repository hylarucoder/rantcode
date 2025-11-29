import * as fs from 'node:fs/promises'
import { getSettingsPath, getConfigRoot } from '../paths'

export type ClaudeTokens = {
  official?: string
  kimi?: string
  glm?: string
  minmax?: string
}

function getClaudeTokensPath(): string {
  return getSettingsPath('claude.tokens.json')
}

export async function readClaudeTokens(): Promise<ClaudeTokens> {
  const file = getClaudeTokensPath()
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as ClaudeTokens
    return {}
  } catch {
    return {}
  }
}

export async function writeClaudeTokens(tokens: ClaudeTokens): Promise<void> {
  const file = getClaudeTokensPath()
  await fs.mkdir(getConfigRoot(), { recursive: true })
  await fs.writeFile(file, JSON.stringify(tokens, null, 2), 'utf8')
}
