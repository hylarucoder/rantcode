/*
  Claude Code JSON Lines format parser.
  Parses stream-json output from Claude Code CLI.
*/

import type { ConversationSession, SessionMeta } from './types'

// Claude Code JSON Lines 消息类型
interface ClaudeJsonMessage {
  type?: string
  subtype?: string
  cwd?: string
  session_id?: string
  model?: string
  claude_code_version?: string
  message?: {
    content?: Array<{ type: string; text?: string }>
  }
  result?: string
  is_error?: boolean
  duration_ms?: number
  total_cost_usd?: number
}

/**
 * 解析 Claude Code JSON Lines 格式的日志
 */
export function parseClaudeCodeLog(text: string): ConversationSession[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return null

  // 检查第一行是否是有效的 JSON
  try {
    const first = JSON.parse(lines[0]) as ClaudeJsonMessage
    if (!first.type) return null
  } catch {
    return null
  }

  const sessions: ConversationSession[] = []
  let curSession: ConversationSession | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 去掉可能的 [stdout] 或 [stderr] 前缀
    const jsonStr = trimmed.replace(/^\[(stdout|stderr)\]\s*/, '')

    try {
      const json = JSON.parse(jsonStr) as ClaudeJsonMessage

      // init 消息：创建新 session
      if (json.type === 'system' && json.subtype === 'init') {
        const meta: SessionMeta = {
          workdir: json.cwd,
          model: json.model,
          sessionId: json.session_id,
          version: json.claude_code_version
        }
        curSession = { meta, events: [] }
        sessions.push(curSession)
        curSession.events.push({ type: 'session_start', meta })
        continue
      }

      if (!curSession) {
        // 如果还没有 session，创建一个默认的
        curSession = { meta: {}, events: [] }
        sessions.push(curSession)
      }

      // user 消息
      if (json.type === 'user') {
        const content = json.message?.content
        if (content && Array.isArray(content)) {
          const text = content
            .filter((c) => c.type === 'text' && c.text)
            .map((c) => c.text)
            .join('\n')
          if (text) {
            curSession.events.push({ type: 'user', text })
          }
        }
        continue
      }

      // assistant 消息
      if (json.type === 'assistant') {
        const content = json.message?.content
        if (content && Array.isArray(content)) {
          const text = content
            .filter((c) => c.type === 'text' && c.text)
            .map((c) => c.text)
            .join('\n')
          if (text) {
            curSession.events.push({ type: 'assistant', text })
          }
        }
        continue
      }

      // result 消息
      if (json.type === 'result') {
        const ok = json.subtype === 'success' && !json.is_error
        if (json.result) {
          curSession.events.push({
            type: 'exec_result',
            ok,
            durationMs: json.duration_ms,
            text: json.result
          })
        }
        // 更新 session meta
        if (json.total_cost_usd) curSession.meta.costUsd = json.total_cost_usd
        if (json.duration_ms) curSession.meta.durationMs = json.duration_ms
        continue
      }
    } catch {
      // 解析失败，忽略这一行
    }
  }

  return sessions.length > 0 ? sessions : null
}

