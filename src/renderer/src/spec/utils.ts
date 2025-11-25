export function stripFrontmatter(content?: string): string {
  if (!content) return ''
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i]?.trim() === '---') {
        return lines.slice(i + 1).join('\n')
      }
    }
  }
  return content
}
