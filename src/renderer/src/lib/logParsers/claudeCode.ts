/*
  Claude Code JSON Lines format parser.
  Parses stream-json output from Claude Code CLI.
*/

import type { TraceSession, TraceMeta, ToolCallData, TodoItem } from './types'

// Claude Code JSON Lines 消息类型
interface ClaudeJsonMessage {
  type?: string
  subtype?: string
  cwd?: string
  session_id?: string
  parent_session_id?: string // resume 时被恢复的 session ID
  model?: string
  claude_code_version?: string
  message?: {
    content?: Array<{
      type: string
      text?: string
      name?: string // tool_use name
      input?: unknown // tool_use input
      tool_use_id?: string // tool_result reference
      content?: string | unknown // tool_result content
    }>
  }
  result?: string
  is_error?: boolean
  duration_ms?: number
  total_cost_usd?: number
}

/**
 * 解析工具调用参数为结构化数据
 */
function parseToolCallData(name: string, input: unknown): ToolCallData | undefined {
  if (!input || typeof input !== 'object') return undefined

  const args = input as Record<string, unknown>

  switch (name) {
    case 'TodoWrite':
      if (Array.isArray(args.todos)) {
        return {
          kind: 'todo_write',
          todos: args.todos as TodoItem[],
          merge: args.merge as boolean | undefined
        }
      }
      break
    case 'Read':
      if (typeof args.file_path === 'string') {
        return {
          kind: 'read',
          filePath: args.file_path,
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined
        }
      }
      break
    case 'Edit':
      if (typeof args.file_path === 'string') {
        return {
          kind: 'edit',
          filePath: args.file_path,
          oldString: args.old_string as string | undefined,
          newString: args.new_string as string | undefined
        }
      }
      break
    case 'Glob':
      if (typeof args.pattern === 'string') {
        return { kind: 'glob', pattern: args.pattern }
      }
      break
    case 'Grep':
      if (typeof args.pattern === 'string') {
        return {
          kind: 'grep',
          pattern: args.pattern,
          path: args.path as string | undefined
        }
      }
      break
    case 'Bash':
      if (typeof args.command === 'string') {
        return { kind: 'bash', command: args.command }
      }
      break
  }

  return { kind: 'generic', args }
}

/**
 * 解析 Claude Code JSON Lines 格式的 Agent Trace
 */
export function parseClaudeCodeTrace(text: string): TraceSession[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return null

  // 检查第一行是否是有效的 JSON
  try {
    const first = JSON.parse(lines[0]) as ClaudeJsonMessage
    if (!first.type) return null
  } catch {
    return null
  }

  const sessions: TraceSession[] = []
  let curSession: TraceSession | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 去掉可能的 [stdout] 或 [stderr] 前缀
    const jsonStr = trimmed.replace(/^\[(stdout|stderr)\]\s*/, '')

    try {
      const json = JSON.parse(jsonStr) as ClaudeJsonMessage

      // init 消息：创建新 session
      if (json.type === 'system' && json.subtype === 'init') {
        const meta: TraceMeta = {
          workdir: json.cwd,
          model: json.model,
          // 如果是 resume，优先显示 parent_session_id（被恢复的上下文）
          contextId: json.parent_session_id || json.session_id,
          parentSessionId: json.parent_session_id,
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
          // 提取文本内容
          const text = content
            .filter((c) => c.type === 'text' && c.text)
            .map((c) => c.text)
            .join('\n')
          if (text) {
            curSession.events.push({ type: 'user', text })
          }

          // 提取 tool_result 内容（工具执行结果）
          const toolResults = content.filter((c) => c.type === 'tool_result')
          for (const result of toolResults) {
            // tool_result 的 content 可能是字符串或对象
            let resultText = ''
            if (typeof result.content === 'string') {
              resultText = result.content
            } else if (result.content) {
              resultText = JSON.stringify(result.content, null, 2)
            }
            // 只有当结果文本不太长时才显示（避免重复冗长内容）
            if (resultText && resultText.length < 500) {
              curSession.events.push({
                type: 'tool_result',
                ok: true,
                text: resultText
              })
            }
          }
        }
        continue
      }

      // assistant 消息
      if (json.type === 'assistant') {
        const content = json.message?.content
        if (content && Array.isArray(content)) {
          // 提取文本内容
          const textParts = content.filter((c) => c.type === 'text' && c.text)
          if (textParts.length > 0) {
            const text = textParts.map((c) => c.text).join('\n')
            curSession.events.push({ type: 'assistant', text })
          }

          // 提取 tool_use 调用
          const toolUses = content.filter((c) => c.type === 'tool_use' && c.name)
          for (const tool of toolUses) {
            const argsText =
              typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2)
            const data = parseToolCallData(tool.name || '', tool.input)
            curSession.events.push({
              type: 'tool_call',
              name: tool.name || 'unknown',
              argsText: argsText || '',
              data
            })
          }
        }
        continue
      }

      // result 消息
      if (json.type === 'result') {
        const ok = json.subtype === 'success' && !json.is_error
        // 检查是否与最后一个 assistant 消息重复
        // Claude Code 会在 assistant 和 result 消息中输出相同的内容
        const lastEvent = curSession.events[curSession.events.length - 1]
        const isDuplicate =
          json.result && lastEvent?.type === 'assistant' && lastEvent.text === json.result
        // 如果有 duration_ms 或需要显示状态，添加 exec_result 事件
        // 但如果文本重复，则不包含文本以避免重复显示
        if (json.duration_ms != null || json.result) {
          curSession.events.push({
            type: 'exec_result',
            ok,
            durationMs: json.duration_ms,
            text: isDuplicate ? undefined : json.result
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
