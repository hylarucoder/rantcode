import { z } from 'zod'

export const baseKeySchema = z.union([z.literal('repo'), z.literal('agent-docs'), z.literal('')])

export const healthResponseSchema = z.object({
  status: z.string()
})

export const okResponseSchema = z.object({ ok: z.boolean() })

// ============================================================================
// Inferred Types
// ============================================================================

/** 健康检查响应 */
export type HealthResponse = z.infer<typeof healthResponseSchema>

