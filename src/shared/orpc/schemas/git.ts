import { z } from 'zod'

export const gitFileStatusSchema = z.object({
  path: z.string(),
  status: z.enum(['modified', 'added', 'deleted', 'renamed', 'copied', 'untracked', 'unmerged']),
  staged: z.boolean()
})

export const gitStatusSchema = z.object({
  branch: z.string().optional(),
  ahead: z.number().int().optional(),
  behind: z.number().int().optional(),
  files: z.array(gitFileStatusSchema)
})

export const gitStatusInputSchema = z.object({
  projectId: z.string()
})

export const gitDiffInputSchema = z.object({
  projectId: z.string(),
  path: z.string().optional(),
  staged: z.boolean().optional()
})

export const gitDiffHunkSchema = z.object({
  oldStart: z.number().int(),
  oldLines: z.number().int(),
  newStart: z.number().int(),
  newLines: z.number().int(),
  content: z.string()
})

export const gitDiffFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(),
  additions: z.number().int(),
  deletions: z.number().int(),
  hunks: z.array(gitDiffHunkSchema)
})

export const gitDiffSchema = z.object({
  files: z.array(gitDiffFileSchema)
})

// ============================================================================
// Inferred Types
// ============================================================================

/** Git 文件状态 */
export type GitFileStatus = z.infer<typeof gitFileStatusSchema>

/** Git 状态 */
export type GitStatus = z.infer<typeof gitStatusSchema>

/** Git Diff Hunk */
export type GitDiffHunk = z.infer<typeof gitDiffHunkSchema>

/** Git Diff File */
export type GitDiffFile = z.infer<typeof gitDiffFileSchema>

/** Git Diff */
export type GitDiff = z.infer<typeof gitDiffSchema>

