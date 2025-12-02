/**
 * RPC 服务模块
 *
 * 该文件现在从拆分后的 services 模块重导出服务类，保持向后兼容。
 * 新代码建议直接从 './services' 导入。
 */

export { SystemService, FsService, ProjectService, GitService } from './services'
export { resolveProjectRoot, resolveBaseDir } from './services/projects'

// Re-export types for backward compatibility
export type { Session, Message } from '../shared/orpc/schemas'
