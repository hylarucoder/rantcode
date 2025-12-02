import { execFile } from 'node:child_process'
import type {
  GitFileStatus,
  GitStatus,
  GitDiff,
  GitDiffHunk,
  GitDiffFile
} from '../../shared/orpc/schemas'
import { resolveProjectRoot } from './projects'

export class GitService {
  async status(opts: { projectId: string }): Promise<GitStatus> {
    const root = await resolveProjectRoot(opts.projectId)

    // Get branch info
    const branch = await this.runGit(root, ['branch', '--show-current'])

    // Get ahead/behind info
    let ahead = 0
    let behind = 0
    try {
      const tracking = await this.runGit(root, [
        'rev-list',
        '--left-right',
        '--count',
        '@{u}...HEAD'
      ])
      const [behindStr, aheadStr] = tracking.split('\t').map((s) => s.trim())
      behind = parseInt(behindStr || '0', 10)
      ahead = parseInt(aheadStr || '0', 10)
    } catch {
      // No upstream or error - ignore
    }

    // Get file statuses
    const porcelain = await this.runGit(root, ['status', '--porcelain', '-uall'])
    const files: GitFileStatus[] = []

    for (const line of porcelain.split('\n')) {
      if (!line.trim()) continue
      const indexStatus = line[0]
      const worktreeStatus = line[1]
      const filePath = line.slice(3).trim()

      // Handle renames (path contains ' -> ')
      const actualPath = filePath.includes(' -> ') ? filePath.split(' -> ')[1] : filePath

      const status = this.parseStatus(indexStatus, worktreeStatus)
      const staged = indexStatus !== ' ' && indexStatus !== '?'

      if (status) {
        files.push({ path: actualPath, status, staged })
      }
    }

    return {
      branch: branch.trim() || undefined,
      ahead: ahead || undefined,
      behind: behind || undefined,
      files
    }
  }

  async diff(opts: { projectId: string; path?: string; staged?: boolean }): Promise<GitDiff> {
    const root = await resolveProjectRoot(opts.projectId)

    const args = ['diff', '--unified=3']
    if (opts.staged) {
      args.push('--staged')
    }
    if (opts.path) {
      args.push('--', opts.path)
    }

    const output = await this.runGit(root, args)
    return this.parseDiff(output)
  }

  private parseStatus(index: string, worktree: string): GitFileStatus['status'] | null {
    // Untracked
    if (index === '?' && worktree === '?') return 'untracked'
    // Added
    if (index === 'A') return 'added'
    // Deleted
    if (index === 'D' || worktree === 'D') return 'deleted'
    // Renamed
    if (index === 'R') return 'renamed'
    // Copied
    if (index === 'C') return 'copied'
    // Unmerged
    if (index === 'U' || worktree === 'U') return 'unmerged'
    // Modified
    if (index === 'M' || worktree === 'M') return 'modified'
    return null
  }

  private parseDiff(output: string): GitDiff {
    const files: GitDiffFile[] = []
    const fileSections = output.split(/^diff --git /m).filter(Boolean)

    for (const section of fileSections) {
      const lines = section.split('\n')
      const headerLine = lines[0] || ''

      // Parse file paths from header
      const pathMatch = headerLine.match(/a\/(.+?) b\/(.+)/)
      if (!pathMatch) continue

      const oldPath = pathMatch[1]
      const newPath = pathMatch[2]

      let additions = 0
      let deletions = 0
      const hunks: GitDiffHunk[] = []

      // Find hunks
      let hunkContent = ''
      let currentHunk: Partial<GitDiffHunk> | null = null

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]

        // Hunk header
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
        if (hunkMatch) {
          // Save previous hunk
          if (currentHunk) {
            hunks.push({
              oldStart: currentHunk.oldStart!,
              oldLines: currentHunk.oldLines!,
              newStart: currentHunk.newStart!,
              newLines: currentHunk.newLines!,
              content: hunkContent
            })
          }

          currentHunk = {
            oldStart: parseInt(hunkMatch[1], 10),
            oldLines: parseInt(hunkMatch[2] || '1', 10),
            newStart: parseInt(hunkMatch[3], 10),
            newLines: parseInt(hunkMatch[4] || '1', 10)
          }
          hunkContent = line + '\n'
          continue
        }

        if (currentHunk) {
          hunkContent += line + '\n'
          if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++
          }
        }
      }

      // Save last hunk
      if (currentHunk) {
        hunks.push({
          oldStart: currentHunk.oldStart!,
          oldLines: currentHunk.oldLines!,
          newStart: currentHunk.newStart!,
          newLines: currentHunk.newLines!,
          content: hunkContent
        })
      }

      files.push({
        path: newPath,
        oldPath: oldPath !== newPath ? oldPath : undefined,
        additions,
        deletions,
        hunks
      })
    }

    return { files }
  }

  private runGit(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message))
          return
        }
        resolve(stdout)
      })
    })
  }
}

