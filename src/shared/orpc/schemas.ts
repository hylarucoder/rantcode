import { z } from 'zod'
import type { FsTreeNode } from '../types/webui'
import { AGENT_VALUES } from '../agents'

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
  agent: z.enum(AGENT_VALUES).optional(),
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

// Git status and diff schemas
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

export const gitDiffInputSchema = z.object({
  workspaceId: z.string(),
  path: z.string().optional(),
  staged: z.boolean().optional()
})

export const gitDiffSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      oldPath: z.string().optional(),
      additions: z.number().int(),
      deletions: z.number().int(),
      hunks: z.array(
        z.object({
          oldStart: z.number().int(),
          oldLines: z.number().int(),
          newStart: z.number().int(),
          newLines: z.number().int(),
          content: z.string()
        })
      )
    })
  )
})

export const gitStatusInputSchema = z.object({
  workspaceId: z.string()
})

// Chat session schemas (persistent sessions)
export const chatLogEntrySchema = z.object({
  id: z.string(),
  stream: z.enum(['stdout', 'stderr']),
  text: z.string(),
  timestamp: z.number().optional()
})

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  jobId: z.string().optional(),
  status: z.enum(['running', 'success', 'error']).optional(),
  logs: z.array(chatLogEntrySchema).optional(),
  output: z.string().optional(),
  errorMessage: z.string().optional(),
  sessionId: z.string().optional(),
  startedAt: z.number().optional(),
  agent: z.string().optional()
})

export const chatSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(chatMessageSchema),
  codexSessionId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})

export const createSessionInputSchema = z.object({
  workspaceId: z.string(),
  title: z.string().optional()
})

export const updateSessionInputSchema = z.object({
  workspaceId: z.string(),
  sessionId: z.string(),
  title: z.string().optional(),
  codexSessionId: z.string().optional()
})

export const deleteSessionInputSchema = z.object({
  workspaceId: z.string(),
  sessionId: z.string()
})

export const appendMessagesInputSchema = z.object({
  workspaceId: z.string(),
  sessionId: z.string(),
  messages: z.array(chatMessageSchema)
})

export const updateMessageInputSchema = z.object({
  workspaceId: z.string(),
  sessionId: z.string(),
  messageId: z.string(),
  patch: chatMessageSchema.partial()
})

export const listSessionsInputSchema = z.object({
  workspaceId: z.string()
})

export const getSessionInputSchema = z.object({
  workspaceId: z.string(),
  sessionId: z.string()
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
