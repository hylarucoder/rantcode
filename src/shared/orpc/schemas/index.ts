/**
 * oRPC Schema 模块索引
 *
 * 将所有 schema 按领域拆分后统一导出，保持向后兼容。
 */

// Common
export {
  baseKeySchema,
  healthResponseSchema,
  okResponseSchema,
  type HealthResponse
} from './common'

// File System
export {
  fsTreeNodeSchema,
  fsFileSchema,
  fsTreeInputSchema,
  fsReadInputSchema,
  fsWriteInputSchema,
  type FsTreeNode,
  type FsFile
} from './fs'

// Project
export {
  projectInfoSchema,
  createProjectInputSchema,
  updateProjectInputSchema,
  removeProjectInputSchema,
  type ProjectInfo,
  type CreateProjectInput,
  type UpdateProjectInput
} from './project'

// Git
export {
  gitFileStatusSchema,
  gitStatusSchema,
  gitStatusInputSchema,
  gitDiffInputSchema,
  gitDiffHunkSchema,
  gitDiffFileSchema,
  gitDiffSchema,
  type GitFileStatus,
  type GitStatus,
  type GitDiffHunk,
  type GitDiffFile,
  type GitDiff
} from './git'

// Session
export {
  logEntrySchema,
  logMetaSchema,
  messageSchema,
  runnerContextMapSchema,
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
  appendLogInputSchema,
  type Session,
  type Message,
  type LogEntry,
  type LogMeta,
  type LogsResult
} from './session'

// Settings
export { generalSettingsSchema, type GeneralSettings } from './settings'

// Provider
export {
  modelSchema,
  providerSchema,
  catalogSchema,
  claudeVendorKeySchema,
  claudeVendorConfigSchema,
  claudeVendorsCatalogSchema,
  claudeVendorTestResultSchema,
  claudeVendorRunInputSchema,
  type Catalog,
  type ClaudeVendorConfig,
  type ClaudeVendorsCatalog
} from './provider'

// Runner
export {
  codexAgentConfigSchema,
  agentsCatalogSchema,
  codexAgentTestResultSchema,
  agentRunInputSchema,
  agentInfoSchema,
  agentsInfoSchema,
  claudeTokensSchema,
  type AgentsCatalog,
  type AgentRunInput
} from './runner'

