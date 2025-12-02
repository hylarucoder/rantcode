import { z } from 'zod'
import { RUNNER_VALUES } from '../runners'

export const baseKeySchema = z.union([z.literal('repo'), z.literal('agent-docs'), z.literal('')])

export const healthResponseSchema = z.object({
  status: z.string()
})

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

/** Runner 执行输入 */
export const agentRunInputSchema = z.object({
  runner: z.enum(RUNNER_VALUES).optional(),
  /** @deprecated 使用 runner 代替 */
  agent: z.enum(RUNNER_VALUES).optional(),
  projectId: z.string().optional(),
  prompt: z.string().min(1),
  extraArgs: z.array(z.string()).optional(),
  timeoutMs: z.number().int().optional(),
  /** 执行追踪标识 */
  traceId: z.string().optional(),
  /** Runner CLI 上下文标识（用于上下文续写） */
  contextId: z.string().optional()
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

export const gitStatusInputSchema = z.object({
  projectId: z.string()
})

// Session & Message schemas
/** 日志条目 */
export const logEntrySchema = z.object({
  id: z.string(),
  stream: z.enum(['stdout', 'stderr']),
  text: z.string(),
  timestamp: z.number().optional()
})

/** 日志元信息（用于按需加载） */
export const logMetaSchema = z.object({
  count: z.number(),
  sizeBytes: z.number()
})

/** 消息 */
export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  /** 执行追踪标识（用于关联 RunnerEvent） */
  traceId: z.string().optional(),
  status: z.enum(['running', 'success', 'error']).optional(),
  /** @deprecated 使用 getMessageLogs 按需加载，仅用于向后兼容 */
  logs: z.array(logEntrySchema).optional(),
  /** 日志元信息，通过 traceId 关联到独立文件 */
  logMeta: logMetaSchema.optional(),
  output: z.string().optional(),
  errorMessage: z.string().optional(),
  sessionId: z.string().optional(),
  startedAt: z.number().optional(),
  runner: z.string().optional()
})

/**
 * 各 runner 的 CLI 上下文标识映射，支持同一会话切换不同 runner 时保持各自上下文
 * 例如: { "codex": "abc123", "claude-code-glm": "xyz789" }
 */
/** 各 runner 的 CLI 上下文标识映射，键是可选的 */
export const runnerContextMapSchema = z.record(z.enum(RUNNER_VALUES), z.string().optional())

/** 会话 */
export const sessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(messageSchema),
  /** 各 runner 的 CLI 上下文标识映射 */
  runnerContexts: runnerContextMapSchema.optional(),
  /** 是否已归档（不删除但隐藏） */
  archived: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})

export const createSessionInputSchema = z.object({
  projectId: z.string(),
  title: z.string().optional()
})

export const updateSessionInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  title: z.string().optional(),
  runnerContexts: runnerContextMapSchema.optional(),
  /** 归档/取消归档 */
  archived: z.boolean().optional()
})

export const deleteSessionInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string()
})

export const appendMessagesInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  messages: z.array(messageSchema)
})

export const updateMessageInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  messageId: z.string(),
  patch: messageSchema.partial()
})

export const listSessionsInputSchema = z.object({
  projectId: z.string(),
  /** 是否包含已归档的会话，默认 false */
  includeArchived: z.boolean().optional()
})

export const getSessionInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string()
})

/** 获取消息日志输入 */
export const getMessageLogsInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  traceId: z.string(),
  offset: z.number().optional(),
  limit: z.number().optional()
})

/** 获取消息日志输出 */
export const logsResultSchema = z.object({
  logs: z.array(logEntrySchema),
  total: z.number(),
  hasMore: z.boolean()
})

/** 追加日志输入 */
export const appendLogInputSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  traceId: z.string(),
  entry: logEntrySchema
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

// ============================================================================
// Inferred Types (从 zod schema 推导，供三端共享)
// ============================================================================

/** 健康检查响应 */
export type HealthResponse = z.infer<typeof healthResponseSchema>

/** 文件系统文件 */
export type FsFile = z.infer<typeof fsFileSchema>

/** 项目信息 */
export type ProjectInfo = z.infer<typeof projectInfoSchema>

/** 创建项目输入 */
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>

/** 更新项目输入 */
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>

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

/** 会话 */
export type Session = z.infer<typeof sessionSchema>

/** 消息 */
export type Message = z.infer<typeof messageSchema>

/** 日志条目 */
export type LogEntry = z.infer<typeof logEntrySchema>

/** 日志元信息 */
export type LogMeta = z.infer<typeof logMetaSchema>

/** 日志结果 */
export type LogsResult = z.infer<typeof logsResultSchema>

/** 通用设置 */
export type GeneralSettings = z.infer<typeof generalSettingsSchema>

/** Provider 配置 */
export type Catalog = z.infer<typeof catalogSchema>

/** Claude Code Vendor 配置 */
export type ClaudeVendorConfig = z.infer<typeof claudeVendorConfigSchema>

/** Claude Code Vendors 目录 */
export type ClaudeVendorsCatalog = z.infer<typeof claudeVendorsCatalogSchema>

/** Agents 配置目录 */
export type AgentsCatalog = z.infer<typeof agentsCatalogSchema>

/** Agent 执行输入 */
export type AgentRunInput = z.infer<typeof agentRunInputSchema>
