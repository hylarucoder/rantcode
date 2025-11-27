import type { ContractRouterClient } from '@orpc/contract'
import type { RantcodeContract } from '../../shared/orpc/contract'

export interface ProjectsBridge {
  pickRepoPath(): Promise<{ path: string } | null>
}

export function createProjectsBridge(
  client: ContractRouterClient<RantcodeContract>
): ProjectsBridge {
  return {
    async pickRepoPath() {
      // 在 preload 上下文内调用，避免渲染进程跨上下文导航代理属性
      return await client.projects.pickRepoPath()
    }
  }
}
