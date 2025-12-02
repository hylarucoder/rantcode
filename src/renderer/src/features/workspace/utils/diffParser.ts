/**
 * Git Diff 解析工具
 *
 * 将 diff 文本解析为结构化数据，支持 unified 和 split 视图。
 */

export interface ParsedLine {
  type: 'context' | 'addition' | 'deletion' | 'header' | 'meta-add' | 'meta-del'
  content: string
  oldLineNum?: number
  newLineNum?: number
}

export interface SplitLine {
  left: ParsedLine | null
  right: ParsedLine | null
}

/**
 * 解析 hunk 内容为行数组
 */
export function parseHunkLines(content: string): ParsedLine[] {
  const lines = content.split('\n')
  const result: ParsedLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Parse @@ -start,count +start,count @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = parseInt(match[1], 10)
        newLine = parseInt(match[2], 10)
      }
      result.push({ type: 'header', content: line })
    } else if (line.startsWith('+++')) {
      result.push({ type: 'meta-add', content: line })
    } else if (line.startsWith('---')) {
      result.push({ type: 'meta-del', content: line })
    } else if (line.startsWith('+')) {
      result.push({ type: 'addition', content: line.slice(1), newLineNum: newLine })
      newLine++
    } else if (line.startsWith('-')) {
      result.push({ type: 'deletion', content: line.slice(1), oldLineNum: oldLine })
      oldLine++
    } else {
      result.push({
        type: 'context',
        content: line.slice(1) || '',
        oldLineNum: oldLine,
        newLineNum: newLine
      })
      oldLine++
      newLine++
    }
  }

  return result
}

/**
 * 将解析后的行转换为 split 视图格式
 */
export function buildSplitLines(lines: ParsedLine[]): SplitLine[] {
  const result: SplitLine[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.type === 'header' || line.type === 'meta-add' || line.type === 'meta-del') {
      result.push({ left: line, right: line })
      i++
    } else if (line.type === 'context') {
      result.push({ left: line, right: line })
      i++
    } else if (line.type === 'deletion') {
      // Collect consecutive deletions
      const deletions: ParsedLine[] = []
      while (i < lines.length && lines[i].type === 'deletion') {
        deletions.push(lines[i])
        i++
      }
      // Collect consecutive additions
      const additions: ParsedLine[] = []
      while (i < lines.length && lines[i].type === 'addition') {
        additions.push(lines[i])
        i++
      }
      // Pair them up
      const maxLen = Math.max(deletions.length, additions.length)
      for (let j = 0; j < maxLen; j++) {
        result.push({
          left: deletions[j] || null,
          right: additions[j] || null
        })
      }
    } else if (line.type === 'addition') {
      result.push({ left: null, right: line })
      i++
    } else {
      i++
    }
  }

  return result
}

// ============ 缓存机制 ============

interface ParsedDiffCache {
  content: string
  lines: ParsedLine[]
  splitLines: SplitLine[]
}

const diffCache = new Map<string, ParsedDiffCache>()
const MAX_CACHE_SIZE = 50

/**
 * 生成缓存 key
 */
function getCacheKey(content: string): string {
  // 使用内容的简单 hash
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `${hash}_${content.length}`
}

/**
 * 带缓存的 hunk 解析
 */
export function parseHunkLinesWithCache(content: string): ParsedLine[] {
  const key = getCacheKey(content)
  const cached = diffCache.get(key)

  if (cached && cached.content === content) {
    return cached.lines
  }

  const lines = parseHunkLines(content)

  // 清理过大的缓存
  if (diffCache.size >= MAX_CACHE_SIZE) {
    const firstKey = diffCache.keys().next().value
    if (firstKey) diffCache.delete(firstKey)
  }

  diffCache.set(key, { content, lines, splitLines: [] })
  return lines
}

/**
 * 带缓存的 split 行构建
 */
export function buildSplitLinesWithCache(content: string): SplitLine[] {
  const key = getCacheKey(content)
  const cached = diffCache.get(key)

  if (cached && cached.content === content && cached.splitLines.length > 0) {
    return cached.splitLines
  }

  const lines = parseHunkLinesWithCache(content)
  const splitLines = buildSplitLines(lines)

  const existing = diffCache.get(key)
  if (existing) {
    existing.splitLines = splitLines
  }

  return splitLines
}

/**
 * 清空缓存
 */
export function clearDiffCache(): void {
  diffCache.clear()
}
