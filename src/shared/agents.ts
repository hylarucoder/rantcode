/**
 * Agent 配置 - 统一管理所有 agent 的元信息
 * 用于 UI 渲染、类型定义等
 */

export type Agent =
  | 'codex'
  | 'claude-code'
  | 'claude-code-glm'
  | 'claude-code-kimi'
  | 'claude-code-minimax'
  | 'kimi-cli'

export interface AgentUIConfig {
  value: Agent
  label: string
}

/** UI 选择器使用的 agent 列表 */
export const AGENT_UI_LIST: AgentUIConfig[] = [
  { value: 'codex', label: 'codex' },
  { value: 'claude-code', label: 'claude code' },
  { value: 'claude-code-glm', label: 'claude code · glm' },
  { value: 'claude-code-kimi', label: 'claude code · kimi' },
  { value: 'claude-code-minimax', label: 'claude code · minimax' },
  { value: 'kimi-cli', label: 'kimi cli' }
]

/** 所有 agent 值的数组，用于 zod schema */
export const AGENT_VALUES = AGENT_UI_LIST.map((e) => e.value) as [Agent, ...Agent[]]
