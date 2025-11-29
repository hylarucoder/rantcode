import { oc, type AnyContractRouter } from '@orpc/contract'
import { z } from 'zod'
import {
  healthResponseSchema,
  fsTreeInputSchema,
  fsTreeNodeSchema,
  fsReadInputSchema,
  fsWriteInputSchema,
  fsFileSchema,
  projectInfoSchema,
  createProjectInputSchema,
  updateProjectInputSchema,
  removeProjectInputSchema,
  okResponseSchema,
  catalogSchema,
  claudeVendorsCatalogSchema,
  claudeVendorConfigSchema,
  claudeVendorTestResultSchema,
  claudeVendorRunInputSchema,
  agentsCatalogSchema,
  codexAgentConfigSchema,
  codexAgentTestResultSchema,
  generalSettingsSchema,
  agentRunInputSchema,
  gitStatusInputSchema,
  gitStatusSchema,
  gitDiffInputSchema,
  gitDiffSchema,
  sessionSchema,
  createSessionInputSchema,
  updateSessionInputSchema,
  deleteSessionInputSchema,
  appendMessagesInputSchema,
  updateMessageInputSchema,
  listSessionsInputSchema,
  getSessionInputSchema,
  getMessageLogsInputSchema,
  logsResultSchema,
  appendLogInputSchema
} from './schemas'

// Shared type-only oRPC contract for full inference on client and server.
// This defines the procedures, input/output schemas, and serves as a single source of truth.
export const contract = oc.router({
  system: {
    health: oc.output(healthResponseSchema),
    version: oc.output(z.object({ version: z.string() }))
  },
  fs: {
    tree: oc.input(fsTreeInputSchema).output(fsTreeNodeSchema),
    read: oc.input(fsReadInputSchema).output(fsFileSchema),
    write: oc.input(fsWriteInputSchema).output(okResponseSchema)
  },
  projects: {
    list: oc.output(projectInfoSchema.array()),
    add: oc.input(createProjectInputSchema).output(projectInfoSchema),
    update: oc.input(updateProjectInputSchema).output(projectInfoSchema),
    remove: oc.input(removeProjectInputSchema).output(okResponseSchema),
    pickRepoPath: oc.output(z.union([z.object({ path: z.string() }), z.null()]))
  },
  providers: {
    get: oc.output(catalogSchema),
    set: oc.input(catalogSchema).output(catalogSchema)
  },
  vendors: {
    getClaudeCode: oc.output(claudeVendorsCatalogSchema),
    setClaudeCode: oc.input(claudeVendorsCatalogSchema).output(claudeVendorsCatalogSchema),
    testClaudeCode: oc.input(claudeVendorConfigSchema).output(claudeVendorTestResultSchema),
    runClaudePrompt: oc.input(claudeVendorRunInputSchema).output(claudeVendorTestResultSchema)
  },
  // Runner 配置和执行（底层 AI 执行器）
  runners: {
    // 执行 runner
    run: oc.input(agentRunInputSchema).output(z.object({ traceId: z.string() })),
    cancel: oc.input(z.object({ traceId: z.string() })).output(z.object({ ok: z.boolean() })),
    // 配置管理
    get: oc.output(agentsCatalogSchema),
    set: oc.input(agentsCatalogSchema).output(agentsCatalogSchema),
    testCodex: oc.input(codexAgentConfigSchema).output(codexAgentTestResultSchema),
    info: oc.output(
      z.object({
        codex: z.object({ executablePath: z.string().optional(), version: z.string().optional() }),
        claudeCode: z.object({
          executablePath: z.string().optional(),
          version: z.string().optional()
        }),
        kimiCli: z
          .object({ executablePath: z.string().optional(), version: z.string().optional() })
          .optional()
      })
    ),
    getClaudeTokens: oc.output(
      z.object({
        official: z.string().optional(),
        kimi: z.string().optional(),
        glm: z.string().optional(),
        minmax: z.string().optional()
      })
    ),
    setClaudeTokens: oc
      .input(
        z.object({
          official: z.string().optional(),
          kimi: z.string().optional(),
          glm: z.string().optional(),
          minmax: z.string().optional()
        })
      )
      .output(
        z.object({
          official: z.string().optional(),
          kimi: z.string().optional(),
          glm: z.string().optional(),
          minmax: z.string().optional()
        })
      )
  },
  app: {
    getGeneral: oc.output(generalSettingsSchema),
    setGeneral: oc.input(generalSettingsSchema).output(generalSettingsSchema),
    toggleMaximize: oc.output(z.void())
  },
  docs: {
    subscribe: oc
      .input(z.object({ projectId: z.string().optional() }))
      .output(z.object({ ok: z.boolean(), error: z.string().optional() })),
    unsubscribe: oc.input(z.object({ projectId: z.string().optional() })).output(z.void())
  },
  git: {
    status: oc.input(gitStatusInputSchema).output(gitStatusSchema),
    diff: oc.input(gitDiffInputSchema).output(gitDiffSchema)
  },
  sessions: {
    list: oc.input(listSessionsInputSchema).output(sessionSchema.array()),
    get: oc.input(getSessionInputSchema).output(sessionSchema.nullable()),
    create: oc.input(createSessionInputSchema).output(sessionSchema),
    update: oc.input(updateSessionInputSchema).output(sessionSchema),
    delete: oc.input(deleteSessionInputSchema).output(okResponseSchema),
    appendMessages: oc.input(appendMessagesInputSchema).output(sessionSchema),
    updateMessage: oc.input(updateMessageInputSchema).output(sessionSchema),
    /** 按需加载消息日志 */
    getMessageLogs: oc.input(getMessageLogsInputSchema).output(logsResultSchema),
    /** 追加单条日志（Runner 执行时调用） */
    appendLog: oc.input(appendLogInputSchema).output(okResponseSchema)
  }
}) satisfies AnyContractRouter

export type RantcodeContract = typeof contract
