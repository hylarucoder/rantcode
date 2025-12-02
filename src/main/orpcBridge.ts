import { ipcMain, BrowserWindow } from 'electron'
import type { MessagePortMain } from 'electron'
import { os } from '@orpc/server'
// Optionally import the shared contract for alignment (types only)
import { contract as rantcodeContract } from '../shared/orpc/contract'
import { setHiddenRouterContract } from '@orpc/server'
import { StandardRPCHandler } from '@orpc/server/standard'
import { ServerPeer } from '@orpc/standard-server-peer'
import type { EncodedMessage } from '@orpc/standard-server-peer'
import { createServerPeerHandleRequestFn } from '@orpc/server/standard-peer'
import type { Context } from '@orpc/server'
import { SystemService, FsService, ProjectService, GitService } from './rpc'
import { dbSessionService } from './db/services/sessionService'
import { addDocsSubscriber, removeDocsSubscriber } from './docsWatcher'
import { registerNotifyPort, unregisterNotifyPort } from './notifyBridge'
import { loggerService } from './services/loggerService'
import { z } from 'zod'
import * as fs from 'node:fs/promises'

// Extend MessagePortMain to include optional start() method
type MessagePortMainWithStart = MessagePortMain & {
  start?(): void
}
import {
  createProjectInputSchema,
  fsFileSchema,
  fsReadInputSchema,
  fsWriteInputSchema,
  fsTreeInputSchema,
  fsTreeNodeSchema,
  healthResponseSchema,
  okResponseSchema,
  projectInfoSchema,
  removeProjectInputSchema,
  updateProjectInputSchema,
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
  appendLogInputSchema,
  claudeTokensSchema,
  agentsInfoSchema
} from '../shared/orpc/schemas'
import { spawn } from 'node:child_process'
import {
  runClaudeOnce as runClaudeOnceFromModule,
  testClaudeVendor as testClaudeVendorFromModule
} from './runners/claudecode-sdk'
// Defer loading general settings module to avoid creating store before userData override
import { detectAll } from './runners/detect'
import { runCodex, cancelCodex } from './runners/codex'
import { readGeneralSettings, writeGeneralSettings } from './settings/general'
import { readClaudeTokens, writeClaudeTokens, type ClaudeTokens } from './settings/tokens'
import { createJsonStore } from './settings/jsonStore'

/**
 * Set up oRPC server over Electron MessagePort (renderer <-> main).
 *
 * Renderer should call: ipcRenderer.postMessage('orpc:connect', null, [port])
 * and use @orpc/client RPCLink with that MessagePort.
 */
export function setupOrpcBridge(): void {
  const system = new SystemService()
  const fsSvc = new FsService()
  const projects = new ProjectService()
  const gitSvc = new GitService()
  const sessionSvc = dbSessionService

  const orpcLog = loggerService.child('orpc')
  const SLOW_ORPC_THRESHOLD_MS = 200

  function extractInputContext(input: unknown): Record<string, unknown> | undefined {
    if (!input || typeof input !== 'object') return undefined
    const obj = input as Record<string, unknown>
    const keys = ['projectId', 'sessionId', 'messageId', 'traceId'] as const
    const ctx: Record<string, unknown> = {}
    for (const key of keys) {
      const value = obj[key]
      if (typeof value === 'string') {
        ctx[key] = value
      }
    }
    return Object.keys(ctx).length ? ctx : undefined
  }

  /** 广播错误到所有窗口并记录日志 */
  function broadcastError(label: string, error: unknown, input?: unknown): void {
    const asErr = error as { stack?: string; message?: string }
    const msg = asErr?.message || String(error)
    const inputCtx = extractInputContext(input)
    orpcLog.error(`call failed: ${label}`, {
      label,
      message: msg,
      stack: asErr?.stack,
      ...(inputCtx || {})
    })
    try {
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send('orpc:error', { label, stack: asErr?.stack, message: asErr?.message })
      )
    } catch {
      // ignored - notification is best-effort
    }
  }

  /** 包装处理函数，统一错误处理 */
  function withErrorHandler<T>(label: string, fn: () => Promise<T>): () => Promise<T> {
    return async () => {
      try {
        return await fn()
      } catch (err) {
        broadcastError(label, err)
        throw err
      }
    }
  }

  /** 包装带输入的处理函数，统一错误处理 */
  function withInputErrorHandler<I, T>(
    label: string,
    fn: (input: I) => Promise<T>
  ): (ctx: { input: I }) => Promise<T> {
    return async ({ input }) => {
      try {
        return await fn(input)
      } catch (err) {
        broadcastError(label, err, input)
        throw err
      }
    }
  }

  // Providers store
  type Catalog = z.infer<typeof catalogSchema>
  const providersStore = createJsonStore<Catalog>('providers.json')

  // Vendors store (Claude Code)
  type ClaudeVendorsCatalog = z.infer<typeof claudeVendorsCatalogSchema>
  const vendorsStore = createJsonStore<ClaudeVendorsCatalog>('vendors.json', {
    schema: claudeVendorsCatalogSchema
  })

  async function testClaudeVendor(
    cfg: z.infer<typeof claudeVendorConfigSchema>
  ): Promise<{ ok: boolean; error?: string; output?: string; command?: string }> {
    return testClaudeVendorFromModule(cfg)
  }

  async function runClaudeOnce(
    input: z.infer<typeof claudeVendorRunInputSchema>
  ): Promise<{ ok: boolean; error?: string; output?: string; command?: string }> {
    return runClaudeOnceFromModule(input)
  }

  // Agents (Codex) store
  type AgentsCatalog = z.infer<typeof agentsCatalogSchema>
  const agentsStore = createJsonStore<AgentsCatalog>('agents.json')

  // App-level general settings helpers moved to src/main/settings/general.ts
  type GeneralSettings = z.infer<typeof generalSettingsSchema>

  async function testCodexAgent(cfg: {
    binPath?: string
    args?: string[]
  }): Promise<{ ok: boolean; error?: string; output?: string }> {
    try {
      if (!cfg.binPath) return { ok: false, error: 'No binary path' }
      await fs.access(cfg.binPath, fs.constants.X_OK)
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Binary not accessible'
      return { ok: false, error: msg }
    }
    const args = Array.isArray(cfg.args) ? cfg.args.slice() : []
    const withVersion = args.includes('--version') ? args : [...args, '--version']
    const child = spawn(cfg.binPath!, withVersion, {
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    let errOut = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d) => (out += String(d)))
    child.stderr.on('data', (d) => (errOut += String(d)))
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {}
        resolve({ ok: true, output: out || errOut })
      }, 1500)
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({
          ok: (code ?? 0) === 0,
          output: out || errOut,
          error: (code ?? 0) === 0 ? undefined : `exit ${code}`
        })
      })
      child.on('error', (e) => {
        clearTimeout(timer)
        resolve({
          ok: false,
          error: (e as { message?: string })?.message || 'spawn error',
          output: out || errOut
        })
      })
    })
  }

  // Define an orpc router mirroring our shared contract
  const router = os.router({
    system: {
      health: os
        .output(healthResponseSchema)
        .handler(withErrorHandler('system.health', () => system.health())),
      version: os
        .output(z.object({ version: z.string() }))
        .handler(withErrorHandler('system.version', () => system.version()))
    },
    fs: {
      tree: os
        .input(fsTreeInputSchema)
        .output(fsTreeNodeSchema)
        .handler(withInputErrorHandler('fs.tree', (input) => fsSvc.tree(input))),
      read: os
        .input(fsReadInputSchema)
        .output(fsFileSchema)
        .handler(withInputErrorHandler('fs.read', (input) => fsSvc.read(input))),
      write: os
        .input(fsWriteInputSchema)
        .output(okResponseSchema)
        .handler(withInputErrorHandler('fs.write', (input) => fsSvc.write(input)))
    },
    projects: {
      list: os
        .output(projectInfoSchema.array())
        .handler(withErrorHandler('projects.list', () => projects.list())),
      add: os
        .input(createProjectInputSchema)
        .output(projectInfoSchema)
        .handler(withInputErrorHandler('projects.add', (input) => projects.add(input))),
      update: os
        .input(updateProjectInputSchema)
        .output(projectInfoSchema)
        .handler(withInputErrorHandler('projects.update', (input) => projects.update(input))),
      remove: os
        .input(removeProjectInputSchema)
        .output(okResponseSchema)
        .handler(withInputErrorHandler('projects.remove', (input) => projects.remove(input))),
      pickRepoPath: os
        .output(z.union([z.object({ path: z.string() }), z.null()]))
        .handler(withErrorHandler('projects.pickRepoPath', () => projects.pickRepoPath()))
    },
    providers: {
      get: os
        .output(catalogSchema)
        .handler(withErrorHandler('providers.get', () => providersStore.read())),
      set: os
        .input(catalogSchema)
        .output(catalogSchema)
        .handler(
          withInputErrorHandler('providers.set', async (input) => {
            await providersStore.write(input as Catalog)
            return input
          })
        )
    },
    vendors: {
      getClaudeCode: os
        .output(claudeVendorsCatalogSchema)
        .handler(withErrorHandler('vendors.getClaudeCode', () => vendorsStore.read())),
      setClaudeCode: os
        .input(claudeVendorsCatalogSchema)
        .output(claudeVendorsCatalogSchema)
        .handler(
          withInputErrorHandler('vendors.setClaudeCode', async (input) => {
            await vendorsStore.write(input as ClaudeVendorsCatalog)
            return input
          })
        ),
      testClaudeCode: os
        .input(claudeVendorConfigSchema)
        .output(claudeVendorTestResultSchema)
        .handler(
          withInputErrorHandler('vendors.testClaudeCode', async (input) => testClaudeVendor(input))
        ),
      runClaudePrompt: os
        .input(claudeVendorRunInputSchema)
        .output(claudeVendorTestResultSchema)
        .handler(
          withInputErrorHandler('vendors.runClaudePrompt', async (input) => runClaudeOnce(input))
        )
    },
    // Runner 配置和执行（底层 AI 执行器）
    runners: {
      // 执行 runner
      run: os
        .input(agentRunInputSchema)
        .output(z.object({ traceId: z.string() }))
        .handler(
          withInputErrorHandler('runners.run', async (input) => {
            const win = BrowserWindow.getFocusedWindow()
            const wc = win?.webContents
            if (!wc) {
              throw new Error('No active window')
            }
            return runCodex(wc.id, input)
          })
        ),
      cancel: os
        .input(z.object({ traceId: z.string() }))
        .output(z.object({ ok: z.boolean() }))
        .handler(
          withInputErrorHandler('runners.cancel', async (input) => cancelCodex(input.traceId))
        ),
      // 配置管理
      get: os
        .output(agentsCatalogSchema)
        .handler(withErrorHandler('runners.get', () => agentsStore.read())),
      set: os
        .input(agentsCatalogSchema)
        .output(agentsCatalogSchema)
        .handler(
          withInputErrorHandler('runners.set', async (input) => {
            await agentsStore.write(input as AgentsCatalog)
            return input
          })
        ),
      testCodex: os
        .input(codexAgentConfigSchema)
        .output(codexAgentTestResultSchema)
        .handler(
          withInputErrorHandler('runners.testCodex', async (input) =>
            testCodexAgent(input as { binPath?: string; args?: string[] })
          )
        ),
      info: os.output(agentsInfoSchema).handler(
        withErrorHandler('runners.info', async () => {
          const all = await detectAll()
          return {
            codex: { executablePath: all.codex.executablePath, version: all.codex.version },
            claudeCode: {
              executablePath: all.claudeCode.executablePath,
              version: all.claudeCode.version
            },
            kimiCli: { executablePath: all.kimiCli.executablePath, version: all.kimiCli.version }
          }
        })
      ),
      getClaudeTokens: os.output(claudeTokensSchema).handler(
        withErrorHandler('runners.getClaudeTokens', async () => {
          return (await readClaudeTokens()) as ClaudeTokens
        })
      ),
      setClaudeTokens: os
        .input(claudeTokensSchema)
        .output(claudeTokensSchema)
        .handler(
          withInputErrorHandler('runners.setClaudeTokens', async (input) => {
            await writeClaudeTokens(input as ClaudeTokens)
            return input
          })
        )
    },
    app: {
      getGeneral: os.output(generalSettingsSchema).handler(
        withErrorHandler('app.getGeneral', async () => {
          return (await readGeneralSettings()) as GeneralSettings
        })
      ),
      setGeneral: os
        .input(generalSettingsSchema)
        .output(generalSettingsSchema)
        .handler(
          withInputErrorHandler('app.setGeneral', async (input) => {
            const s = input as GeneralSettings
            await writeGeneralSettings(s)
            return s
          })
        ),
      toggleMaximize: os.output(z.void()).handler(
        withErrorHandler('app.toggleMaximize', async () => {
          const win = BrowserWindow.getFocusedWindow()
          if (!win) return
          if (win.isMaximized()) win.unmaximize()
          else win.maximize()
        })
      )
    },
    docs: {
      subscribe: os
        .input(z.object({ projectId: z.string().optional() }))
        .output(z.object({ ok: z.boolean(), error: z.string().optional() }))
        .handler(async ({ input }) => {
          try {
            // Attach to the renderer that owns the MessagePort connection (focused window)
            const win = BrowserWindow.getFocusedWindow()
            const wc = win?.webContents
            if (!wc) return { ok: false, error: 'No active window' }
            await addDocsSubscriber(input.projectId, wc)
            return { ok: true }
          } catch (err) {
            const msg = (err as { message?: string })?.message || 'subscribe failed'
            return { ok: false, error: msg }
          }
        }),
      unsubscribe: os
        .input(z.object({ projectId: z.string().optional() }))
        .output(z.void())
        .handler(async ({ input }) => {
          try {
            const win = BrowserWindow.getFocusedWindow()
            const wc = win?.webContents
            if (wc) removeDocsSubscriber(input.projectId, wc.id)
          } catch {
            // ignore
          }
        })
    },
    git: {
      status: os
        .input(gitStatusInputSchema)
        .output(gitStatusSchema)
        .handler(withInputErrorHandler('git.status', (input) => gitSvc.status(input))),
      diff: os
        .input(gitDiffInputSchema)
        .output(gitDiffSchema)
        .handler(withInputErrorHandler('git.diff', (input) => gitSvc.diff(input)))
    },
    sessions: {
      list: os
        .input(listSessionsInputSchema)
        .output(sessionSchema.array())
        .handler(withInputErrorHandler('sessions.list', (input) => sessionSvc.list(input))),
      get: os
        .input(getSessionInputSchema)
        .output(sessionSchema.nullable())
        .handler(withInputErrorHandler('sessions.get', (input) => sessionSvc.get(input))),
      create: os
        .input(createSessionInputSchema)
        .output(sessionSchema)
        .handler(withInputErrorHandler('sessions.create', (input) => sessionSvc.create(input))),
      update: os
        .input(updateSessionInputSchema)
        .output(sessionSchema)
        .handler(withInputErrorHandler('sessions.update', (input) => sessionSvc.update(input))),
      delete: os
        .input(deleteSessionInputSchema)
        .output(okResponseSchema)
        .handler(withInputErrorHandler('sessions.delete', (input) => sessionSvc.delete(input))),
      appendMessages: os
        .input(appendMessagesInputSchema)
        .output(sessionSchema)
        .handler(
          withInputErrorHandler('sessions.appendMessages', (input) =>
            sessionSvc.appendMessages(input)
          )
        ),
      updateMessage: os
        .input(updateMessageInputSchema)
        .output(sessionSchema)
        .handler(
          withInputErrorHandler('sessions.updateMessage', (input) =>
            sessionSvc.updateMessage(input)
          )
        ),
      getMessageLogs: os
        .input(getMessageLogsInputSchema)
        .output(logsResultSchema)
        .handler(
          withInputErrorHandler('sessions.getMessageLogs', (input) =>
            sessionSvc.getMessageLogs(input)
          )
        ),
      appendLog: os
        .input(appendLogInputSchema)
        .output(okResponseSchema)
        .handler(
          withInputErrorHandler('sessions.appendLog', (input) => sessionSvc.appendLog(input))
        )
    }
  })

  // Attach shared contract to the router for introspection/tools
  try {
    setHiddenRouterContract(router, rantcodeContract)
  } catch {
    // ignored - tooling contract linking may be unavailable in prod
  }

  const handler = new StandardRPCHandler<Context>(router, {
    // Prefix is optional; keep default so procedures map to /system/health etc internally.
  })

  ipcMain.on('orpc:connect', (event) => {
    const [port] = event.ports
    if (!port) return
    orpcLog.info('renderer connected')

    // Wire ServerPeer to the MessagePort
    const peer = new ServerPeer(async (encoded) => {
      // Forward encoded messages back to renderer
      port.postMessage(encoded)
    })

    const handleRequest = createServerPeerHandleRequestFn(handler, {
      context: {} as Context
    })

    // Handle incoming messages
    port.on('message', (event) => {
      const t0 = Date.now()
      // Let ServerPeer decode and route
      const data = (event as unknown as { data: EncodedMessage }).data
      void peer
        .message(data, handleRequest)
        .then(() => {
          const dt = Date.now() - t0
          if (dt > SLOW_ORPC_THRESHOLD_MS) {
            orpcLog.warn('orpc-message-slow', { durationMs: dt })
          } else {
            orpcLog.debug('orpc-message-handled', { durationMs: dt })
          }
        })
        .catch((err) => {
          const asErr = err as { stack?: string; message?: string }
          orpcLog.error('failed to handle message', {
            message: asErr?.message,
            stack: asErr?.stack
          })
        })
    })

    // Start the port; renderer owns the other end
    ;(port as MessagePortMainWithStart).start?.()
  })

  // Secondary notify channel (server -> renderer) for out-of-band events
  ipcMain.on('orpc:notify-connect', (event) => {
    const [port] = event.ports
    if (!port) return
    const wc = event.sender
    registerNotifyPort(wc.id, port)
    wc.once('destroyed', () => unregisterNotifyPort(wc.id))
  })
}
