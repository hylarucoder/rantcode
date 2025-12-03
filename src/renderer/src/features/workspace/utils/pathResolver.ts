/**
 * 解析相对路径
 *
 * 给定基础文件路径和相对路径，计算出最终的绝对路径。
 * 支持 `..` 和 `.` 路径片段。
 *
 * @param basePath 基础文件路径（如 `docs/guide/intro.md`）
 * @param relativePath 相对路径（如 `../api/index.md`）
 * @returns 解析后的路径（如 `docs/api/index.md`）
 *
 * @example
 * resolveRelativePath('docs/guide/intro.md', '../api/index.md')
 * // => 'docs/api/index.md'
 *
 * resolveRelativePath('docs/guide/intro.md', './sibling.md')
 * // => 'docs/guide/sibling.md'
 */
export function resolveRelativePath(basePath: string, relativePath: string): string {
  // 获取基础目录（移除文件名）
  const baseDir = basePath.split('/').slice(0, -1)
  const parts = relativePath.split('/')
  const resolvedParts = baseDir.length > 0 ? [...baseDir] : []

  for (const part of parts) {
    if (part === '..') {
      resolvedParts.pop()
    } else if (part !== '.' && part !== '') {
      resolvedParts.push(part)
    }
  }

  return resolvedParts.join('/')
}

