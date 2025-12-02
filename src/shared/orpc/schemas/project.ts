import { z } from 'zod'

export const projectInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  repoPath: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastOpenedAt: z.string().optional()
})

export const createProjectInputSchema = z.object({
  repoPath: z.string(),
  name: z.string().optional()
})

export const updateProjectInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  repoPath: z.string().optional()
})

export const removeProjectInputSchema = z.object({
  id: z.string()
})

// ============================================================================
// Inferred Types
// ============================================================================

/** 项目信息 */
export type ProjectInfo = z.infer<typeof projectInfoSchema>

/** 创建项目输入 */
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>

/** 更新项目输入 */
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>

