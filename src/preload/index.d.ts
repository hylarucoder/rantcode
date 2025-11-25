import { ElectronAPI } from '@electron-toolkit/preload'
import type { CodexEvent, CodexRunOptions } from '../shared/types/webui'
import type { LoggerBridge } from './bridges/logger'
import type { DocsBridge } from './bridges/docs'

type AgentVendor = 'codex' | 'claude-code' | 'kimi-cli'

interface AgentsBridge {
  run(opts: Omit<CodexRunOptions, 'engine'> & { vendor?: AgentVendor }): Promise<{ jobId: string }>
  subscribe(handler: (event: CodexEvent) => void): () => void
  cancel(jobId: string): Promise<{ ok: boolean }>
  vendor: {
    ['codex']: { run: (opts: Omit<CodexRunOptions, 'engine'>) => Promise<{ jobId: string }> }
    ['claude-code']: { run: (opts: Omit<CodexRunOptions, 'engine'>) => Promise<{ jobId: string }> }
    ['kimi-cli']: { run: (opts: Omit<CodexRunOptions, 'engine'>) => Promise<{ jobId: string }> }
  }
}

interface ProjectsBridge {
  pickRepoPath(): Promise<{ path: string } | null>
}

declare global {
  interface Window {
    api: {
      electron: ElectronAPI
      orpcCall: (
        path: readonly string[],
        input: unknown
      ) => Promise<unknown>
      agents: AgentsBridge
      docs: DocsBridge
      projects: ProjectsBridge
      logger?: LoggerBridge
      initialGeneral?: { language: 'zh-CN' | 'en-US'; theme: 'light' | 'dark' }
    }
  }
}
