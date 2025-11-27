import { ElectronAPI } from '@electron-toolkit/preload'
import type { CodexEvent, CodexRunOptions } from '../shared/types/webui'
import type { LoggerBridge } from './bridges/logger'
import type { DocsBridge } from './bridges/docs'

interface AgentsBridge {
  run(opts: CodexRunOptions): Promise<{ jobId: string }>
  subscribe(handler: (event: CodexEvent) => void): () => void
  cancel(jobId: string): Promise<{ ok: boolean }>
}

interface ProjectsBridge {
  pickRepoPath(): Promise<{ path: string } | null>
}

declare global {
  interface Window {
    api: {
      electron: ElectronAPI
      orpcCall: (path: readonly string[], input: unknown) => Promise<unknown>
      agents: AgentsBridge
      docs: DocsBridge
      projects: ProjectsBridge
      logger?: LoggerBridge
      initialGeneral?: { language: 'zh-CN' | 'en-US'; theme: 'light' | 'dark' }
    }
  }
}
