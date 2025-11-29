import { ElectronAPI } from '@electron-toolkit/preload'
import type { RunnerEvent, RunnerRunOptions } from '../shared/types/webui'
import type { LoggerBridge } from './bridges/logger'
import type { DocsBridge } from './bridges/docs'

interface RunnersBridge {
  run(opts: RunnerRunOptions): Promise<{ jobId: string }>
  subscribe(handler: (event: RunnerEvent) => void): () => void
  cancel(jobId: string): Promise<{ ok: boolean }>
}

/** @deprecated 使用 RunnersBridge 代替 */
type AgentsBridge = RunnersBridge

interface ProjectsBridge {
  pickRepoPath(): Promise<{ path: string } | null>
}

declare global {
  interface Window {
    api: {
      electron: ElectronAPI
      orpcCall: (path: readonly string[], input: unknown) => Promise<unknown>
      runners: RunnersBridge
      /** @deprecated 使用 runners 代替 */
      agents: RunnersBridge
      docs: DocsBridge
      projects: ProjectsBridge
      logger?: LoggerBridge
      initialGeneral?: { language: 'zh-CN' | 'en-US'; theme: 'light' | 'dark' }
    }
  }
}
