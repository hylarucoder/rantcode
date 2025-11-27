/*
  Codex CLI log format parser.
  Parses text output from OpenAI Codex CLI.
*/

import type { ConversationSession, SessionMeta } from './types'

const SESSION_START_RE = /^\[stderr\]OpenAI Codex v/i
const DASHES_RE = /^[-]{4,}$/
const KV_RE = /^(.*?):\s*(.*)$/
const USER_RE = /^user$/
const ASSISTANT_RE = /^\[stderr\]codex$/
const THINKING_RE = /^(?:\[stderr\])?thinking$/
const EXEC_RE = /^\[stderr\]exec$/
const SUCCEEDED_RE = /^\[stderr\]\s*succeeded in\s*(\d+)ms:/i
const EXITED_RE = /^\[stderr\].*?exited\s*(\d+)\s*in\s*(\d+)ms:/i
const TOOL_CALL_RE = /^\[stderr\]tool\s+([^()]+)\((.*)\)\s*$/
const FILE_UPDATE_RE = /^\[stderr\]file update/i
const DIFF_START_RE = /^diff --git /i
const PLAN_UPDATE_RE = /^\[stderr\]Plan update$/
const TOKENS_USED_RE = /^\[stderr\]tokens used$/i
const TOTAL_LINES_RE = /^Total output lines:\s*(\d+)/
const TRUNCATED_RE = /^\[\.\.\. output truncated.*\]$/

// 仅返回可从 Codex 日志中解析的字符串类型的 meta key
type CodexMetaKey =
  | 'workdir'
  | 'model'
  | 'provider'
  | 'approval'
  | 'sandbox'
  | 'sessionId'
  | 'reasoningEffort'
  | 'reasoningSummaries'
  | 'version'

function normalizeMetaKey(key: string): CodexMetaKey | undefined {
  const k = key.trim().toLowerCase()
  if (k === 'workdir') return 'workdir'
  if (k === 'model') return 'model'
  if (k === 'provider') return 'provider'
  if (k === 'approval') return 'approval'
  if (k === 'sandbox') return 'sandbox'
  if (k === 'session id') return 'sessionId'
  if (k === 'reasoning effort') return 'reasoningEffort'
  if (k === 'reasoning summaries') return 'reasoningSummaries'
  return undefined
}

/**
 * 解析 Codex CLI 格式的日志
 */
export function parseCodexLog(text: string): ConversationSession[] | null {
  const lines = text.split(/\r?\n/)
  const sessions: ConversationSession[] = []

  let curSession: ConversationSession | null = null
  let i = 0

  // helpers for collecting blocks until a next event marker
  function isEventStartLine(s: string): boolean {
    return (
      USER_RE.test(s) ||
      ASSISTANT_RE.test(s) ||
      THINKING_RE.test(s) ||
      EXEC_RE.test(s) ||
      PLAN_UPDATE_RE.test(s) ||
      FILE_UPDATE_RE.test(s) ||
      DIFF_START_RE.test(s) ||
      TOKENS_USED_RE.test(s) ||
      TOTAL_LINES_RE.test(s) ||
      TRUNCATED_RE.test(s) ||
      SESSION_START_RE.test(s) ||
      TOOL_CALL_RE.test(s) ||
      SUCCEEDED_RE.test(s) ||
      EXITED_RE.test(s)
    )
  }

  function collectUntilEvent(startIndex: number): { text: string; nextIndex: number } {
    const buf: string[] = []
    let j = startIndex
    while (j < lines.length) {
      const ln = lines[j]
      if (isEventStartLine(ln)) break
      buf.push(ln)
      j++
    }
    // trim trailing blank lines
    while (buf.length > 0 && buf[buf.length - 1].trim() === '') buf.pop()
    return { text: buf.join('\n'), nextIndex: j }
  }

  while (i < lines.length) {
    const line = lines[i]

    // Session start
    if (SESSION_START_RE.test(line)) {
      // Expect dash line, meta kv pairs, then dash line
      const meta: SessionMeta = {}
      i++
      if (i < lines.length && DASHES_RE.test(lines[i])) i++
      while (i < lines.length && !DASHES_RE.test(lines[i])) {
        const m = lines[i].match(KV_RE)
        if (m) {
          const key = normalizeMetaKey(m[1] || '')
          const value = (m[2] || '').trim()
          if (key) meta[key] = value
        }
        i++
      }
      if (i < lines.length && DASHES_RE.test(lines[i])) i++
      curSession = { meta, events: [] }
      sessions.push(curSession)
      // push a synthetic session_start event to help renderers if needed
      curSession.events.push({ type: 'session_start', meta })
      continue
    }

    if (!curSession) {
      // skip lines until a session starts
      i++
      continue
    }

    // User message
    if (USER_RE.test(line)) {
      const { text: body, nextIndex } = collectUntilEvent(i + 1)
      curSession.events.push({ type: 'user', text: body })
      i = nextIndex
      continue
    }

    // Assistant message
    if (ASSISTANT_RE.test(line)) {
      const { text: body, nextIndex } = collectUntilEvent(i + 1)
      curSession.events.push({ type: 'assistant', text: body })
      i = nextIndex
      continue
    }

    // Thinking / note
    if (THINKING_RE.test(line)) {
      const { text: body, nextIndex } = collectUntilEvent(i + 1)
      curSession.events.push({ type: 'note', channel: 'thinking', text: body })
      i = nextIndex
      continue
    }

    // Exec call
    if (EXEC_RE.test(line)) {
      const next = lines[i + 1] || ''
      let command = next
      let workdir: string | undefined
      // try to extract trailing " in <workdir>"
      const idx = next.lastIndexOf(' in ')
      if (idx > -1) {
        command = next.slice(0, idx)
        workdir = next.slice(idx + 4)
      }
      curSession.events.push({ type: 'exec_call', command, workdir })
      i += 2
      continue
    }

    // Exec/Tool result success with duration
    const mSucc = line.match(SUCCEEDED_RE)
    if (mSucc) {
      const durationMs = Number(mSucc[1]) || undefined
      const { text: body, nextIndex } = collectUntilEvent(i + 1)
      curSession.events.push({ type: 'exec_result', ok: true, durationMs, text: body })
      i = nextIndex
      continue
    }

    const mExit = line.match(EXITED_RE)
    if (mExit) {
      const code = Number(mExit[1])
      const durationMs = Number(mExit[2])
      const { text: body, nextIndex } = collectUntilEvent(i + 1)
      const ok = code === 0
      // Without tracking stack of calls, treat as tool_result by default
      curSession.events.push({ type: 'tool_result', ok, code, durationMs, text: body })
      i = nextIndex
      continue
    }

    // Tool call
    const mTool = line.match(TOOL_CALL_RE)
    if (mTool) {
      const name = (mTool[1] || '').trim()
      const argsText = (mTool[2] || '').trim()
      curSession.events.push({ type: 'tool_call', name, argsText })
      i++
      continue
    }

    // File update / Patch
    if (FILE_UPDATE_RE.test(line)) {
      const { text: diff, nextIndex } = collectUntilEvent(i + 1)
      curSession.events.push({ type: 'patch', header: 'file update', diff })
      i = nextIndex
      continue
    }

    if (DIFF_START_RE.test(line)) {
      const { text: rest, nextIndex } = collectUntilEvent(i + 1)
      const diff = [line, rest].filter(Boolean).join('\n')
      curSession.events.push({ type: 'patch', header: 'diff', diff })
      i = nextIndex
      continue
    }

    if (PLAN_UPDATE_RE.test(line)) {
      const { text: body, nextIndex } = collectUntilEvent(i + 1)
      curSession.events.push({ type: 'plan_update', text: body })
      i = nextIndex
      continue
    }

    if (TOKENS_USED_RE.test(line)) {
      const value = (lines[i + 1] || '').trim()
      curSession.events.push({ type: 'stats', name: 'tokens used', value })
      i += 2
      continue
    }

    const mTotal = line.match(TOTAL_LINES_RE)
    if (mTotal) {
      curSession.events.push({ type: 'truncated', reason: `Total output lines: ${mTotal[1]}` })
      i++
      continue
    }

    if (TRUNCATED_RE.test(line)) {
      curSession.events.push({ type: 'truncated', reason: 'output truncated' })
      i++
      continue
    }

    // Unknown line - store minimal for debugging, but avoid huge spam of empty lines
    if (line && line.trim().length > 0) {
      curSession.events.push({ type: 'unknown', raw: line })
    }
    i++
  }

  return sessions.length > 0 ? sessions : null
}

