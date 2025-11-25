import { z } from 'zod'
import type { FsTreeNode } from '../types/webui'

export const baseKeySchema = z.union([
  z.literal('repo'),
  z.literal('docs'),
  z.literal('vibe-spec'),
  z.literal('')
])

export const healthResponseSchema = z.object({
  status: z.string()
})

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

export const okResponseSchema = z.object({ ok: z.boolean() })

export const fsTreeInputSchema = z.object({
  base: baseKeySchema.optional(),
  depth: z.number().int().optional(),
  workspaceId: z.string().optional()
})

export const fsReadInputSchema = z.object({
  base: baseKeySchema.optional(),
  path: z.string().min(1),
  workspaceId: z.string().optional()
})

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

// Agents: Codex CLI config
export const codexAgentConfigSchema = z.object({
  binPath: z.string().optional(),
  args: z.array(z.string()).optional(),
  defaultModel: z.string().optional()
})

export const agentsCatalogSchema = z.object({
  codex: codexAgentConfigSchema.optional()
})

export const codexAgentTestResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  output: z.string().optional()
})

// Codex run input
export const codexRunInputSchema = z.object({
  engine: z.union([z.literal('codex'), z.literal('claude-code'), z.literal('kimi-cli')]).optional(),
  workspaceId: z.string().optional(),
  prompt: z.string().min(1),
  extraArgs: z.array(z.string()).optional(),
  timeoutMs: z.number().int().optional(),
  jobId: z.string().optional(),
  sessionId: z.string().optional()
})

// Agent detection info (CLI path & version)
export const agentInfoSchema = z.object({
  name: z.string().optional(),
  executablePath: z.string().optional(),
  version: z.string().optional()
})

export const agentsInfoSchema = z.object({
  codex: agentInfoSchema,
  claudeCode: agentInfoSchema,
  kimiCli: agentInfoSchema.optional()
})

// Claude Code provider tokens
export const claudeTokensSchema = z.object({
  official: z.string().optional(),
  kimi: z.string().optional(),
  glm: z.string().optional(),
  minmax: z.string().optional()
})

// App-level general settings (UI prefs; non-sensitive)
export const generalSettingsSchema = z.object({
  language: z.union([z.literal('zh-CN'), z.literal('en-US')]).default('zh-CN'),
  theme: z.union([z.literal('light'), z.literal('dark')]).default('dark'),
  zoomFactor: z.number().min(0.5).max(3).default(1),
  trayEnabled: z.boolean().default(false),
  autoLaunch: z.boolean().default(false),
  appearance: z
    .object({
      transparent: z.boolean().default(false),
      vibrancy: z.union([z.boolean(), z.string()]).default(false),
      hardwareAcceleration: z.boolean().default(true),
      waylandShortcutsPortal: z.boolean().default(true)
    })
    .default({
      transparent: false,
      vibrancy: false,
      hardwareAcceleration: true,
      waylandShortcutsPortal: true
    })
})
