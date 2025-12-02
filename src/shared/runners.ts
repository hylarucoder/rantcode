/**
 * Runner 配置 - 统一管理所有 runner（底层 AI 执行器）的元信息
 * 用于 UI 渲染、类型定义等
 *
 * Runner 是底层执行器（如 Claude Code、Codex），负责实际调用 CLI 工具
 * Agent 是用户可配置的助手，定义职责和 System Prompt（见 agents.ts）
 *
 * 所有 claude-code 相关 runner 已迁移至 Agent SDK 模式
 */

export type Runner =
  | 'codex'
  | 'claude-code'
  | 'claude-code-glm'
  | 'claude-code-kimi'
  | 'claude-code-minimax'
  | 'kimi-cli'

export interface RunnerUIConfig {
  value: Runner
  label: string
}

/** UI 选择器使用的 runner 列表 */
export const RUNNER_UI_LIST: RunnerUIConfig[] = [
  { value: 'codex', label: 'codex' },
  { value: 'claude-code', label: 'claude code' },
  { value: 'claude-code-glm', label: 'claude code · glm' },
  { value: 'claude-code-kimi', label: 'claude code · kimi' },
  { value: 'claude-code-minimax', label: 'claude code · minimax' },
  { value: 'kimi-cli', label: 'kimi cli' }
]

/** 所有 runner 值的数组，用于 zod schema */
export const RUNNER_VALUES = RUNNER_UI_LIST.map((e) => e.value) as [Runner, ...Runner[]]

/** 检查 runner 是否使用 Agent SDK（所有 claude-code 相关 runner 都使用 SDK） */
export function isAgentSDKRunner(runner: Runner): boolean {
  return runner.startsWith('claude-code')
}
