/**
 * Frontmatter 解析与更新工具
 *
 * 用于解析和更新 Markdown 文件的 YAML frontmatter。
 */

/**
 * 解析 frontmatter 为键值对
 */
export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return {}

  const frontmatter: Record<string, string> = {}
  const lines = match[1].split('\n')
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line
        .slice(colonIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
      frontmatter[key] = value
    }
  }
  return frontmatter
}

/**
 * 更新 frontmatter 中的单个字段
 */
export function updateFrontmatter(content: string, key: string, value: string): string {
  const match = content.match(/^(---\s*\n)([\s\S]*?)(\n---)/)
  if (!match) {
    // 没有 frontmatter，创建一个
    return `---\n${key}: ${value}\n---\n\n${content}`
  }

  const [, start, fmContent, end] = match
  const lines = fmContent.split('\n')
  let found = false

  const newLines = lines.map((line) => {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const lineKey = line.slice(0, colonIndex).trim()
      if (lineKey === key) {
        found = true
        return `${key}: ${value}`
      }
    }
    return line
  })

  if (!found) {
    newLines.push(`${key}: ${value}`)
  }

  const restContent = content.slice(match[0].length)
  return `${start}${newLines.join('\n')}${end}${restContent}`
}

/**
 * 更新 frontmatter 中的多个字段
 */
export function updateFrontmatterFields(content: string, updates: Record<string, string>): string {
  let result = content
  for (const [key, value] of Object.entries(updates)) {
    result = updateFrontmatter(result, key, value)
  }
  return result
}

/**
 * 从文件名生成标题
 */
export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * 检查内容是否有 frontmatter
 */
export function hasFrontmatter(content: string): boolean {
  return /^---\s*\n[\s\S]*?\n---/.test(content)
}

/**
 * 获取 frontmatter 的原始文本
 */
export function getFrontmatterRaw(content: string): string | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  return match ? match[1] : null
}

/**
 * 获取 frontmatter 之后的正文内容
 */
export function getBodyContent(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n?/)
  return match ? content.slice(match[0].length) : content
}
