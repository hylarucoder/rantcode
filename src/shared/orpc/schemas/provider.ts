import { z } from 'zod'

// Providers config schemas
export const modelSchema = z.object({
  name: z.string().optional(),
  id: z.string().optional(),
  context_window: z.number().int().optional(),
  default_max_tokens: z.number().int().optional()
})

export const providerSchema = z.object({
  name: z.string().optional(),
  base_url: z.string().optional(),
  type: z.string().optional(),
  models: z.array(modelSchema).optional()
})

export const catalogSchema = z.record(z.string(), providerSchema)

// Claude Code vendor configuration schemas
export const claudeVendorKeySchema = z.union([
  z.literal('anthropic'),
  z.literal('kimi'),
  z.literal('glm'),
  z.literal('minmax'),
  z.literal('custom')
])

export const claudeVendorConfigSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
  vendorKey: claudeVendorKeySchema,
  binPath: z.string().min(1),
  args: z.array(z.string()).optional(),
  promptMode: z.union([z.literal('stdin'), z.literal('arg')]).default('stdin'),
  promptTemplate: z.string().optional(),
  envVars: z.record(z.string(), z.string()).default({}),
  modelPrimary: z.string().optional(),
  modelFast: z.string().optional(),
  active: z.boolean().optional(),
  lastTestAt: z.number().int().optional(),
  lastTestOk: z.boolean().optional()
})

export const claudeVendorsCatalogSchema = z.record(z.string(), claudeVendorConfigSchema)

export const claudeVendorTestResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  output: z.string().optional(),
  command: z.string().optional()
})

// Run Claude Code once with a prompt
export const claudeVendorRunInputSchema = z.object({
  config: claudeVendorConfigSchema,
  prompt: z.string().min(1)
})

// ============================================================================
// Inferred Types
// ============================================================================

/** Provider 配置 */
export type Catalog = z.infer<typeof catalogSchema>

/** Claude Code Vendor 配置 */
export type ClaudeVendorConfig = z.infer<typeof claudeVendorConfigSchema>

/** Claude Code Vendors 目录 */
export type ClaudeVendorsCatalog = z.infer<typeof claudeVendorsCatalogSchema>

