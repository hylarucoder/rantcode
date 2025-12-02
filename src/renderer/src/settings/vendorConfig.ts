/**
 * Claude vendor configuration constants
 */

export type VendorKey = 'anthropic' | 'kimi' | 'glm' | 'minmax' | 'custom'

export type ClaudeVendorConfig = {
  id: string
  displayName?: string
  vendorKey: VendorKey
  binPath: string
  args?: string[]
  promptMode?: 'stdin' | 'arg'
  promptTemplate?: string
  envVars?: Record<string, string>
  modelPrimary?: string
  modelFast?: string
  active?: boolean
  lastTestAt?: number
  lastTestOk?: boolean
}

export type VendorCatalog = Record<string, ClaudeVendorConfig>

export type TokenKey = 'official' | 'kimi' | 'glm' | 'minmax'

export const VENDOR_COLORS: Record<VendorKey, string> = {
  kimi: 'text-blue-500 bg-blue-500/10',
  glm: 'text-green-500 bg-green-500/10',
  minmax: 'text-purple-500 bg-purple-500/10',
  anthropic: 'text-orange-500 bg-orange-500/10',
  custom: 'text-gray-500 bg-gray-500/10'
}

export const VENDOR_LABELS: Record<VendorKey, string> = {
  kimi: 'Moonshot AI',
  glm: '智谱 AI',
  minmax: 'Minimax AI',
  anthropic: 'Anthropic',
  custom: 'Custom'
}

export const MODEL_OPTIONS: Record<VendorKey, string[]> = {
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-haiku-latest'],
  kimi: ['kimi-k2-preview', 'kimi-k2-turbo-preview', 'kimi-k2-thinking', 'kimi-k2-thinking-turbo'],
  glm: ['GLM-4.6'],
  minmax: ['MiniMax-M2'],
  custom: []
}

export const TOKEN_KEYS: Record<VendorKey, TokenKey> = {
  kimi: 'kimi',
  glm: 'glm',
  minmax: 'minmax',
  anthropic: 'official',
  custom: 'official'
}

export const ENV_KEY_NAMES: Record<TokenKey, string> = {
  kimi: 'KIMI_API_KEY',
  glm: 'ZHIPU_API_KEY',
  minmax: 'MINMAX_API_KEY',
  official: 'ANTHROPIC_API_KEY'
}
