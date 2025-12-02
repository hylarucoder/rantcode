import { z } from 'zod'
import { baseKeySchema } from './common'

/** 文件系统节点（递归类型） */
export interface FsTreeNode {
  path: string
  name: string
  dir: boolean
  children?: FsTreeNode[]
}

export const fsTreeNodeSchema: z.ZodType<FsTreeNode> = z.lazy(() =>
  z.object({
    path: z.string(),
    name: z.string(),
    dir: z.boolean(),
    children: z.array(fsTreeNodeSchema).optional()
  })
)

export const fsFileSchema = z.object({
  path: z.string(),
  content: z.string()
})

export const fsTreeInputSchema = z.object({
  base: baseKeySchema.optional(),
  depth: z.number().int().optional(),
  projectId: z.string().optional()
})

export const fsReadInputSchema = z.object({
  base: baseKeySchema.optional(),
  path: z.string().min(1),
  projectId: z.string().optional()
})

export const fsWriteInputSchema = z.object({
  base: baseKeySchema.optional(),
  path: z.string().min(1),
  content: z.string(),
  projectId: z.string().optional()
})

// ============================================================================
// Inferred Types
// ============================================================================

/** 文件系统文件 */
export type FsFile = z.infer<typeof fsFileSchema>

