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
import { SystemService, FsService, ProjectService, GitService, SessionService } from './rpc'
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
} from '../shared/orpc/schemas'
import { spawn } from 'node:child_process'
import {
  runClaudeOnce as runClaudeOnceFromModule,
  testClaudeVendor as testClaudeVendorFromModule
} from './agents/claudecode'
// Defer loading general settings module to avoid creating store before userData override
import { detectAll } from './agents/detect'
import { runCodex, cancelCodex } from './agents/codex'
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
  const sessionSvc = new SessionService()

  const orpcLog = loggerService.child('orpc')

  /** 广播错误到所有窗口并记录日志 */
  function broadcastError(label: string, error: unknown): void {
    const asErr = error as { stack?: string; message?: string }
    const msg = asErr?.message || String(error)
    orpcLog.error(`call failed: ${label}`, { message: msg, stack: asErr?.stack })
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
        broadcastError(label, err)
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
      get: os.output(catalogSchema).handler(async () => providersStore.read()),
      set: os
        .input(catalogSchema)
        .output(catalogSchema)
        .handler(async ({ input }) => {
          await providersStore.write(input as Catalog)
          return input
        })
    },
    vendors: {
      getClaudeCode: os.output(claudeVendorsCatalogSchema).handler(async () => vendorsStore.read()),
      setClaudeCode: os
        .input(claudeVendorsCatalogSchema)
        .output(claudeVendorsCatalogSchema)
        .handler(async ({ input }) => {
          await vendorsStore.write(input as ClaudeVendorsCatalog)
          return input
        }),
      testClaudeCode: os
        .input(claudeVendorConfigSchema)
        .output(
          z.object({ ok: z.boolean(), error: z.string().optional(), output: z.string().optional() })
        )
        .handler(async ({ input }) => {
          return testClaudeVendor(input)
        }),
      runClaudePrompt: os
        .input(claudeVendorRunInputSchema)
        .output(
          z.object({ ok: z.boolean(), error: z.string().optional(), output: z.string().optional() })
        )
        .handler(async ({ input }) => runClaudeOnce(input))
    },
    codex: {
      run: os
        .input(codexRunInputSchema)
        .output(z.object({ jobId: z.string() }))
        .handler(async ({ input }) => {
          const win = BrowserWindow.getFocusedWindow()
          const wc = win?.webContents
          if (!wc) {
            throw new Error('No active window')
          }
          return runCodex(wc.id, input)
        }),
      cancel: os
        .input(z.object({ jobId: z.string() }))
        .output(z.object({ ok: z.boolean() }))
        .handler(async ({ input }) => cancelCodex(input.jobId))
    },
    agents: {
      get: os.output(agentsCatalogSchema).handler(async () => agentsStore.read()),
      set: os
        .input(agentsCatalogSchema)
        .output(agentsCatalogSchema)
        .handler(async ({ input }) => {
          await agentsStore.write(input as AgentsCatalog)
          return input
        }),
      testCodex: os
        .input(codexAgentConfigSchema)
        .output(codexAgentTestResultSchema)
        .handler(async ({ input }) =>
          testCodexAgent(input as { binPath?: string; args?: string[] })
        ),
      info: os
        .output(
          z.object({
            codex: z.object({
              executablePath: z.string().optional(),
              version: z.string().optional()
            }),
            claudeCode: z.object({
              executablePath: z.string().optional(),
              version: z.string().optional()
            }),
            kimiCli: z
              .object({ executablePath: z.string().optional(), version: z.string().optional() })
              .optional()
          })
        )
        .handler(async () => {
          const all = await detectAll()
          return {
            codex: { executablePath: all.codex.executablePath, version: all.codex.version },
            claudeCode: {
              executablePath: all.claudeCode.executablePath,
              version: all.claudeCode.version
            },
            kimiCli: { executablePath: all.kimiCli.executablePath, version: all.kimiCli.version }
          }
        }),
      getClaudeTokens: os
        .output(
          z.object({
            official: z.string().optional(),
            kimi: z.string().optional(),
            glm: z.string().optional(),
            minmax: z.string().optional()
          })
        )
        .handler(async () => (await readClaudeTokens()) as ClaudeTokens),
      setClaudeTokens: os
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
        .handler(async ({ input }) => {
          await writeClaudeTokens(input as ClaudeTokens)
          return input
        })
    },
    app: {
      getGeneral: os.output(generalSettingsSchema).handler(async () => {
        return (await readGeneralSettings()) as GeneralSettings
      }),
      setGeneral: os
        .input(generalSettingsSchema)
        .output(generalSettingsSchema)
        .handler(async ({ input }) => {
          const s = input as GeneralSettings
          await writeGeneralSettings(s)
          return s
        }),
      toggleMaximize: os.output(z.void()).handler(async () => {
        const win = BrowserWindow.getFocusedWindow()
        if (!win) return
        if (win.isMaximized()) win.unmaximize()
        else win.maximize()
      })
    },
    docs: {
      subscribe: os
        .input(z.object({ workspaceId: z.string().optional() }))
        .output(z.object({ ok: z.boolean(), error: z.string().optional() }))
        .handler(async ({ input }) => {
          try {
            // Attach to the renderer that owns the MessagePort connection (focused window)
            const win = BrowserWindow.getFocusedWindow()
            const wc = win?.webContents
            if (!wc) return { ok: false, error: 'No active window' }
            await addDocsSubscriber(input.workspaceId, wc)
            return { ok: true }
          } catch (err) {
            const msg = (err as { message?: string })?.message || 'subscribe failed'
            return { ok: false, error: msg }
          }
        }),
      unsubscribe: os
        .input(z.object({ workspaceId: z.string().optional() }))
        .output(z.void())
        .handler(async ({ input }) => {
          try {
            const win = BrowserWindow.getFocusedWindow()
            const wc = win?.webContents
            if (wc) removeDocsSubscriber(input.workspaceId, wc.id)
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
        .output(chatSessionSchema.array())
        .handler(withInputErrorHandler('sessions.list', (input) => sessionSvc.list(input))),
      get: os
        .input(getSessionInputSchema)
        .output(chatSessionSchema.nullable())
        .handler(withInputErrorHandler('sessions.get', (input) => sessionSvc.get(input))),
      create: os
        .input(createSessionInputSchema)
        .output(chatSessionSchema)
        .handler(withInputErrorHandler('sessions.create', (input) => sessionSvc.create(input))),
      update: os
        .input(updateSessionInputSchema)
        .output(chatSessionSchema)
        .handler(withInputErrorHandler('sessions.update', (input) => sessionSvc.update(input))),
      delete: os
        .input(deleteSessionInputSchema)
        .output(okResponseSchema)
        .handler(withInputErrorHandler('sessions.delete', (input) => sessionSvc.delete(input))),
      appendMessages: os
        .input(appendMessagesInputSchema)
        .output(chatSessionSchema)
        .handler(
          withInputErrorHandler('sessions.appendMessages', (input) =>
            sessionSvc.appendMessages(input)
          )
        ),
      updateMessage: os
        .input(updateMessageInputSchema)
        .output(chatSessionSchema)
        .handler(
          withInputErrorHandler('sessions.updateMessage', (input) =>
            sessionSvc.updateMessage(input)
          )
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
          orpcLog.info('message handled', { duration_ms: dt })
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
