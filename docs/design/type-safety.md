# TypeScript 类型安全（无 any 策略）

目标：在不改变运行时语义与公共 API 的前提下，以最小风险消除 any（显式/隐式），并在组件边界、外部数据与错误处理处提供强类型约束。

## 原则与优先级

- 优先级：组件边界 > 外部数据入口 > 工具函数 > 错误处理 > 其他。
- 方法偏好：unknown + narrowing、泛型约束、可判别联合、type guard。
- 禁止：any 与非空断言 !（除非明确证明安全）。

## 已落地的改动（要点）

- 预加载桥（preload）
  - 统一暴露为 `window.api`，通过 `window.api.rpc` 使用基于合约推导的 typed client（不再使用字符串路径调用）。
  - 渲染侧全部使用 `createRouterUtils` 暴露的 `queryOptions/mutationOptions`，避免动态 any。

- 主进程（main）
  - `catch (err: unknown)`，在使用前通过 `instanceof Error` 或 `isErrorLike()` 缩小类型。
  - oRPC Server 消息处理严格化（MessagePort 的 `message` 事件数据声明为框架的 `EncodedMessage`）。

- 共享 Schema & 类型
  - `fsTreeNodeSchema` 与 `FsTreeNode` 对齐，移除 `any[]`，改为递归 `z.lazy` + 共享接口。
  - 新增 `isErrorLike(value): value is { message: string }`。

- oRPC 客户端与 hooks
  - 引入共享合约 `src/shared/orpc/contract.ts`（基于 `@orpc/contract`）。
  - 渲染层客户端使用 `ContractRouterClient<typeof contract>` 推导，`createRouterUtils` 提供 `queryOptions/mutationOptions` 强类型工具。
  - 所有 hooks（projects/spec/settings）切回 `orpc.*.queryOptions()` 与 `mutationOptions()`，移除 any。

- UI 组件
  - `MessageList` 改为泛型 `<T extends BaseMessage>`，避免在调用处 `as any`。
  - 统一移除 `ref as any`，`useAutoScrollBottom(ref, ...)` 已接受 `RefObject<HTMLElement>`。

## 为何选择这些改动

- 降低风险：在边界处用 unknown 收敛，避免把不信任数据扩散成 any。
- 可渐进扩展：合约在 `shared/` 中声明，既服务主进程路由，也给渲染端推导；未来可加入错误映射、事件流等。
- 与现有运行时行为一致：所有调用路径与数据结构未改变，仅强化了类型约束。

## 为贡献者准备的指南

1. 新增 oRPC 端点

- 在 `src/shared/orpc/contract.ts` 增加 `xxx: oc.input(schema).output(schema)`。
- 在 `src/main/orpcBridge.ts` 对应实现 handler（`router` 中定义 `.handler(async ({ input }) => ...)`）。
- 在渲染层通过 `orpc.xxx.yyy.queryOptions()/mutationOptions()` 使用。

2. 错误处理

- `catch (e: unknown)`；
- 使用 `isErrorLike` 或 `instanceof Error` 获取安全的 `message`。
- 可选：在合约端点上定义 `errors({...})`，将错误类型显式化给客户端。

3. 外部数据

- 文件/网络/IPC 输入一律先声明为 `unknown`，通过 zod schema 或自定义 type guard 缩小；
- 避免在组件内部长期持有任何“未验证”的结构。

## 可能的后续增强（可选）

- 在合约上为关键端点定义 `errors()`（HTTP 语义与代码），渲染层可获得更好的错误分支类型。
- 打开 `exactOptionalPropertyTypes` 与 `noUncheckedIndexedAccess` 并补全分支，进一步提升安全性。
- 将合约通过 `minifyContractRouter()` 生成 JSON，下发到渲染层，减少打包体积。
