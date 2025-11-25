import { app, ipcMain, BrowserWindow } from 'electron'
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
import { SystemService, FsService, ProjectService } from './rpc'
import { addDocsSubscriber, removeDocsSubscriber } from './docsWatcher'
import { registerNotifyPort, unregisterNotifyPort } from './notifyBridge'
import { loggerService } from './services/loggerService'
import { z } from 'zod'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// Extend MessagePortMain to include optional start() method
type MessagePortMainWithStart = MessagePortMain & {
  start?(): void
}
import {
  createProjectInputSchema,
  fsFileSchema,
  fsReadInputSchema,
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
  codexRunInputSchema
} from '../shared/orpc/schemas'
import { spawn } from 'node:child_process'
import {
  runClaudeOnce as runClaudeOnceFromModule,
  testClaudeVendor as testClaudeVendorFromModule
} from './vendors/claudeCodeRunner'
// Defer loading general settings module to avoid creating store before userData override
import { detectAll } from './agents/detect'
import { runCodex, cancelCodex } from './codexRunner'
import { readGeneralSettings, writeGeneralSettings } from './settings/general'

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

  const orpcLog = loggerService.child('orpc')
  function logError(label: string, error: unknown): void {
    const asErr = error as { stack?: string; message?: string }
    const msg = asErr?.message || String(error)
    orpcLog.error(`call failed: ${label}`, { message: msg, stack: asErr?.stack })
  }

  // Providers store helpers
  type Catalog = z.infer<typeof catalogSchema>
  function getProvidersStorePath(): string {
    const userData = app.getPath('userData')
    return path.join(userData, 'providers.json')
  }
  async function readProviders(): Promise<Catalog> {
    const file = getProvidersStorePath()
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as Catalog
      return {}
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return {}
      throw err
    }
  }
  async function writeProviders(catalog: Catalog): Promise<void> {
    const file = getProvidersStorePath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(catalog, null, 2), 'utf8')
  }

  // Vendors store helpers (Claude Code)
  type ClaudeVendorsCatalog = z.infer<typeof claudeVendorsCatalogSchema>
  function getVendorsStorePath(): string {
    const userData = app.getPath('userData')
    return path.join(userData, 'vendors.json')
  }
  async function readClaudeVendors(): Promise<ClaudeVendorsCatalog> {
    const file = getVendorsStorePath()
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      const result = claudeVendorsCatalogSchema.safeParse(parsed)
      return result.success ? result.data : {}
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return {}
      throw err
    }
  }
  async function writeClaudeVendors(catalog: ClaudeVendorsCatalog): Promise<void> {
    const file = getVendorsStorePath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(catalog, null, 2), 'utf8')
  }

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

  // Agents (Codex) store helpers
  type AgentsCatalog = z.infer<typeof agentsCatalogSchema>
  function getAgentsStorePath(): string {
    const userData = app.getPath('userData')
    return path.join(userData, 'agents.json')
  }
  async function readAgents(): Promise<AgentsCatalog> {
    const file = getAgentsStorePath()
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      return parsed as AgentsCatalog
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return {} as AgentsCatalog
      throw err
    }
  }
  async function writeAgents(catalog: AgentsCatalog): Promise<void> {
    const file = getAgentsStorePath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(catalog, null, 2), 'utf8')
  }

  // App-level general settings helpers moved to src/main/settings/general.ts
  type GeneralSettings = z.infer<typeof generalSettingsSchema>

  // Claude Code tokens helpers
  type ClaudeTokens = { official?: string; kimi?: string; glm?: string; minmax?: string }
  function getClaudeTokensPath(): string {
    const userData = app.getPath('userData')
    return path.join(userData, 'claude.tokens.json')
  }
  async function readClaudeTokens(): Promise<ClaudeTokens> {
    const file = getClaudeTokensPath()
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as ClaudeTokens
      return {}
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return {}
      throw err
    }
  }
  async function writeClaudeTokens(tokens: ClaudeTokens): Promise<void> {
    const file = getClaudeTokensPath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(tokens, null, 2), 'utf8')
  }

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
      health: os.output(healthResponseSchema).handler(async () => {
        try {
          return await system.health()
        } catch (err) {
          logError('system.health', err)
          try {
            const stack = (err as { stack?: string; message?: string })?.stack
            const message = (err as { message?: string })?.message
            BrowserWindow.getAllWindows().forEach((w) =>
              w.webContents.send('orpc:error', { label: 'system.health', stack, message })
            )
          } catch {
            void 0
          }
          throw err
        }
      }),
      version: os.output(z.object({ version: z.string() })).handler(async () => {
        try {
          return await system.version()
        } catch (err) {
          logError('system.version', err)
          try {
            const stack = (err as { stack?: string; message?: string })?.stack
            const message = (err as { message?: string })?.message
            BrowserWindow.getAllWindows().forEach((w) =>
              w.webContents.send('orpc:error', { label: 'system.version', stack, message })
            )
          } catch {
            void 0
          }
          throw err
        }
      })
    },
    fs: {
      tree: os
        .input(fsTreeInputSchema)
        .output(fsTreeNodeSchema)
        .handler(async ({ input }) => {
          try {
            return await fsSvc.tree(input)
          } catch (err) {
            logError('fs.tree', err)
            try {
              const stack = (err as { stack?: string; message?: string })?.stack
              const message = (err as { message?: string })?.message
              BrowserWindow.getAllWindows().forEach((w) =>
                w.webContents.send('orpc:error', { label: 'fs.tree', stack, message })
              )
            } catch {
              void 0
            }
            throw err
          }
        }),
      read: os
        .input(fsReadInputSchema)
        .output(fsFileSchema)
        .handler(async ({ input }) => {
          try {
            return await fsSvc.read(input)
          } catch (err) {
            logError('fs.read', err)
            try {
              const stack = (err as { stack?: string; message?: string })?.stack
              const message = (err as { message?: string })?.message
              BrowserWindow.getAllWindows().forEach((w) =>
                w.webContents.send('orpc:error', { label: 'fs.read', stack, message })
              )
            } catch {
              void 0
            }
            throw err
          }
        })
    },
    projects: {
      list: os.output(projectInfoSchema.array()).handler(async () => {
        try {
          return await projects.list()
        } catch (err) {
          logError('projects.list', err)
          try {
            const stack = (err as { stack?: string; message?: string })?.stack
            const message = (err as { message?: string })?.message
            BrowserWindow.getAllWindows().forEach((w) =>
              w.webContents.send('orpc:error', { label: 'projects.list', stack, message })
            )
          } catch {
            void 0
          }
          throw err
        }
      }),
      add: os
        .input(createProjectInputSchema)
        .output(projectInfoSchema)
        .handler(async ({ input }) => {
          try {
            return await projects.add(input)
          } catch (err) {
            logError('projects.add', err)
            try {
              const stack = (err as { stack?: string; message?: string })?.stack
              const message = (err as { message?: string })?.message
              BrowserWindow.getAllWindows().forEach((w) =>
                w.webContents.send('orpc:error', { label: 'projects.add', stack, message })
              )
            } catch {
              void 0
            }
            throw err
          }
        }),
      update: os
        .input(updateProjectInputSchema)
        .output(projectInfoSchema)
        .handler(async ({ input }) => {
          try {
            return await projects.update(input)
          } catch (err) {
            logError('projects.update', err)
            try {
              const stack = (err as { stack?: string; message?: string })?.stack
              const message = (err as { message?: string })?.message
              BrowserWindow.getAllWindows().forEach((w) =>
                w.webContents.send('orpc:error', { label: 'projects.update', stack, message })
              )
            } catch {
              void 0
            }
            throw err
          }
        }),
      remove: os
        .input(removeProjectInputSchema)
        .output(okResponseSchema)
        .handler(async ({ input }) => {
          try {
            return await projects.remove(input)
          } catch (err) {
            logError('projects.remove', err)
            try {
              const stack = (err as { stack?: string; message?: string })?.stack
              const message = (err as { message?: string })?.message
              BrowserWindow.getAllWindows().forEach((w) =>
                w.webContents.send('orpc:error', { label: 'projects.remove', stack, message })
              )
            } catch {
              void 0
            }
            throw err
          }
        }),
      pickRepoPath: os
        .output(z.union([z.object({ path: z.string() }), z.null()]))
        .handler(async () => {
          try {
            return await projects.pickRepoPath()
          } catch (err) {
            logError('projects.pickRepoPath', err)
            try {
              const stack = (err as { stack?: string; message?: string })?.stack
              const message = (err as { message?: string })?.message
              BrowserWindow.getAllWindows().forEach((w) =>
                w.webContents.send('orpc:error', { label: 'projects.pickRepoPath', stack, message })
              )
            } catch {
              void 0
            }
            throw err
          }
        })
    },
    providers: {
      get: os.output(catalogSchema).handler(async () => (await readProviders()) as Catalog),
      set: os
        .input(catalogSchema)
        .output(catalogSchema)
        .handler(async ({ input }) => {
          await writeProviders(input as Catalog)
          return input
        })
    },
    vendors: {
      getClaudeCode: os
        .output(claudeVendorsCatalogSchema)
        .handler(async () => (await readClaudeVendors()) as ClaudeVendorsCatalog),
      setClaudeCode: os
        .input(claudeVendorsCatalogSchema)
        .output(claudeVendorsCatalogSchema)
        .handler(async ({ input }) => {
          await writeClaudeVendors(input as ClaudeVendorsCatalog)
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
      get: os
        .output(agentsCatalogSchema)
        .handler(async () => (await readAgents()) as AgentsCatalog),
      set: os
        .input(agentsCatalogSchema)
        .output(agentsCatalogSchema)
        .handler(async ({ input }) => {
          await writeAgents(input as AgentsCatalog)
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
    }
  })

  // Attach shared contract to the router for introspection/tools
  try {
    setHiddenRouterContract(router, rantcodeContract)
  } catch {
    // Ignore if tooling contract linking is unavailable in prod
    void 0
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
