import { oc, type AnyContractRouter } from '@orpc/contract'
import { z } from 'zod'
import {
  healthResponseSchema,
  fsTreeInputSchema,
  fsTreeNodeSchema,
  fsReadInputSchema,
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
  codexRunInputSchema,
  gitStatusInputSchema,
  gitStatusSchema,
  gitDiffInputSchema,
  gitDiffSchema,
  chatSessionSchema,
  createSessionInputSchema,
  updateSessionInputSchema,
  deleteSessionInputSchema,
  appendMessagesInputSchema,
  updateMessageInputSchema,
  listSessionsInputSchema,
  getSessionInputSchema
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
    read: oc.input(fsReadInputSchema).output(fsFileSchema)
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
  agents: {
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
  codex: {
    run: oc.input(codexRunInputSchema).output(z.object({ jobId: z.string() })),
    cancel: oc.input(z.object({ jobId: z.string() })).output(z.object({ ok: z.boolean() }))
  },
  app: {
    getGeneral: oc.output(generalSettingsSchema),
    setGeneral: oc.input(generalSettingsSchema).output(generalSettingsSchema),
    toggleMaximize: oc.output(z.void())
  },
  docs: {
    subscribe: oc
      .input(z.object({ workspaceId: z.string().optional() }))
      .output(z.object({ ok: z.boolean(), error: z.string().optional() })),
    unsubscribe: oc.input(z.object({ workspaceId: z.string().optional() })).output(z.void())
  },
  git: {
    status: oc.input(gitStatusInputSchema).output(gitStatusSchema),
    diff: oc.input(gitDiffInputSchema).output(gitDiffSchema)
  },
  sessions: {
    list: oc.input(listSessionsInputSchema).output(chatSessionSchema.array()),
    get: oc.input(getSessionInputSchema).output(chatSessionSchema.nullable()),
    create: oc.input(createSessionInputSchema).output(chatSessionSchema),
    update: oc.input(updateSessionInputSchema).output(chatSessionSchema),
    delete: oc.input(deleteSessionInputSchema).output(okResponseSchema),
    appendMessages: oc.input(appendMessagesInputSchema).output(chatSessionSchema),
    updateMessage: oc.input(updateMessageInputSchema).output(chatSessionSchema)
  }
}) satisfies AnyContractRouter

export type RantcodeContract = typeof contract
