# oRPC 合约与用法

本文档说明如何在本仓库里以「合约优先」的方式声明、实现、消费 oRPC 接口，并复用到渲染层的 TanStack Query。

## 合约声明（shared）

- 位置：`src/shared/orpc/contract.ts`
- 工具：`@orpc/contract` 的 `oc.router()`；输入输出均为 zod schema。

### 完整命名空间

| 命名空间 | 说明 | 端点 |
|----------|------|------|
| `system` | 系统状态 | `health`, `version` |
| `fs` | 文件系统 | `tree`, `read`, `write` |
| `projects` | 项目管理 | `list`, `add`, `update`, `remove`, `pickRepoPath` |
| `providers` | Provider 配置 | `get`, `set` |
| `vendors` | Claude Code 供应商 | `getClaudeCode`, `setClaudeCode`, `testClaudeCode`, `runClaudePrompt` |
| `runners` | Runner 执行器 | `run`, `cancel`, `get`, `set`, `testCodex`, `info`, `getClaudeTokens`, `setClaudeTokens` |
| `app` | 应用设置 | `getGeneral`, `setGeneral`, `toggleMaximize` |
| `docs` | 文档监听 | `subscribe`, `unsubscribe` |
| `git` | Git 集成 | `status`, `diff` |
| `sessions` | 会话管理 | `list`, `get`, `create`, `update`, `delete`, `appendMessages`, `updateMessage`, `getMessageLogs`, `appendLog` |

```ts
// 片段示例
export const contract = oc.router({
  system: {
    health: oc.output(healthResponseSchema),
    version: oc.output(z.object({ version: z.string() }))
  },
  fs: {
    tree: oc.input(fsTreeInputSchema).output(fsTreeNodeSchema),
    read: oc.input(fsReadInputSchema).output(fsFileSchema),
    write: oc.input(fsWriteInputSchema).output(okResponseSchema)
  },
  // ...更多命名空间见 src/shared/orpc/contract.ts
})

export type RantcodeContract = typeof contract
```

## 服务端实现（main）

- 位置：`src/main/orpcBridge.ts`
- 使用 `@orpc/server` 的 `os.router()` 定义实际处理器，并可通过 `setHiddenRouterContract(router, contract)` 将共享合约附着到路由（便于工具/调试）。

```ts
const router = os.router({
  fs: {
    tree: os
      .input(fsTreeInputSchema)
      .output(fsTreeNodeSchema)
      .handler(async ({ input }) => fsSvc.tree(input)),
    read: os
      .input(fsReadInputSchema)
      .output(fsFileSchema)
      .handler(async ({ input }) => fsSvc.read(input)),
    write: os
      .input(fsWriteInputSchema)
      .output(okResponseSchema)
      .handler(async ({ input }) => fsSvc.write(input))
  }
})

setHiddenRouterContract(router, contract)
```

## 客户端与 Query 工具（renderer）

- 位置：`src/renderer/src/lib/orpcQuery.ts`
- 使用 `createORPCClient` + `createRouterUtils`，并将类型指定为 `ContractRouterClient<typeof contract>`，得到强类型的 `call/queryOptions/mutationOptions/key` 等工具。

```ts
export const orpc = createRouterUtils(getClient())

// 用法 in hooks
const options = orpc.fs.read.queryOptions({ input })
return useQuery({ ...options, enabled })
```

## 新增一个端点的步骤

1. 在 `shared/orpc/contract.ts` 中增加 `xxx: oc.input(...).output(...)`。
2. 在 `main/orpcBridge.ts` 的 `os.router` 中添加同名端点并实现 `handler`。
3. 在渲染层使用 `orpc.xxx.yyy.queryOptions()/mutationOptions()` 或直接 `orpc.xxx.yyy.call()`。
4. 如有需要，补充 zod schema 与共享类型（`src/shared/...`）。

### 实际使用示例

```ts
// 渲染层 hooks 示例
export function useFileQuery(path: string) {
  return useQuery(orpc.fs.read.queryOptions({ input: { path } }))
}

export function useWriteFileMutation() {
  return useMutation(orpc.fs.write.mutationOptions())
}

// 直接调用示例
const result = await orpc.system.health.call()
```

## 错误处理（可选强化）

- 建议为容易出错的端点（如文件读写、项目增删改）定义 `errors({...})`。
- 渲染层可通过 `useQuery`/`useMutation` 的 error 泛型获得更明确的错误分支类型，提升用户反馈与重试策略质量。

## 体积优化（可选）

- 生产构建阶段可调用 `minifyContractRouter(contract)` 生成 JSON 合约，下发给渲染层；客户端用 JSON 合约即可，无需包含完整构建器代码。
