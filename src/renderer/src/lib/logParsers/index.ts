/*
  Log parsers for different agent types.
  Each agent has its own parsing logic for conversation logs.
*/

export * from './types'
export { parseClaudeCodeLog } from './claudeCode'
export { parseCodexLog } from './codex'

import type { ConversationSession } from './types'
import { parseClaudeCodeLog } from './claudeCode'
import { parseCodexLog } from './codex'

/**
 * 自动检测日志格式并解析
 * 依次尝试各个 agent 的解析器，返回第一个成功的结果
 */
export function parseConversationLog(text: string): ConversationSession[] {
  // 尝试 Claude Code JSON Lines 格式
  const claudeResult = parseClaudeCodeLog(text)
  if (claudeResult) return claudeResult

  // 尝试 Codex CLI 格式
  const codexResult = parseCodexLog(text)
  if (codexResult) return codexResult

  // 没有匹配的格式
  return []
}
