import { z } from 'zod'
import { RUNNER_VALUES } from '../../runners'

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

// ============================================================================
// Inferred Types
// ============================================================================

/** Agents 配置目录 */
export type AgentsCatalog = z.infer<typeof agentsCatalogSchema>

/** Agent 执行输入 */
export type AgentRunInput = z.infer<typeof agentRunInputSchema>

