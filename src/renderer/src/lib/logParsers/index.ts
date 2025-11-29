/*
  Agent Trace parsers for different agent types.
  Each agent has its own parsing logic for trace logs.
*/

export * from './types'
export { parseClaudeCodeTrace } from './claudeCode'
export { parseCodexTrace } from './codex'

import type { TraceSession } from './types'
import { parseClaudeCodeTrace } from './claudeCode'
import { parseCodexTrace } from './codex'

/**
 * 自动检测日志格式并解析为 Agent Trace
 * 依次尝试各个 agent 的解析器，返回第一个成功的结果
 */
export function parseAgentTrace(text: string): TraceSession[] {
  // 尝试 Claude Code JSON Lines 格式
  const claudeResult = parseClaudeCodeTrace(text)
  if (claudeResult) return claudeResult

  // 尝试 Codex CLI 格式
  const codexResult = parseCodexTrace(text)
  if (codexResult) return codexResult

  // 没有匹配的格式
  return []
}
