## Docs 模块边界说明（window.api.docs）

本文定义 Docs（工作区文档监控/推送）在应用中的边界、职责与约束，确保在多工作区/多窗口下稳定地进行文件变更通知与 UI 同步。

目标
- 渲染层只消费事件，不直接访问文件系统。
- 主进程集中负责文件监控、路径安全与事件聚合。
- 明确多窗口/多工作区的订阅/清理语义，避免资源泄漏和串扰。

分层与通道
- 渲染层（Renderer）：通过 `window.api.docs.subscribe({ workspaceId }, handler)` 订阅；不直接触碰 Node/Electron。
- 预加载（Preload）：在 `window.api` 中暴露 `docs` 桥，桥接 oRPC 与 notify 通道。
- 主进程（Main）：使用 chokidar 监控工作区 `agent-docs/` 目录，并通过 notify 通道向订阅窗口推送事件。
- 通道：
  - oRPC：`docs.subscribe` / `docs.unsubscribe` 管理订阅生命周期（与窗口 webContents 绑定）。
  - Notify：主题 `docs`；服务端 → 渲染端单向广播增量事件。

外部接口（Renderer API）
- `window.api.docs.subscribe({ workspaceId }, handler)` → `() => void`（取消订阅）。
- 事件类型：`DocsWatcherEvent`（见 `src/shared/types/webui.ts`）。常见事件：
  - `ready`：监控器已就绪（包含 `root`）。
  - `file`：`changeType: 'add' | 'change' | 'unlink'`、`path`、可选 `content`、`updatedAt`。
  - `error`：监控器级别错误消息。
- 推荐 Hook：`useDocsWatcher(workspaceId)`（见 `src/renderer/src/state/docs.ts`）。

主进程实现边界
- 入口：`src/main/docsWatcher.ts`
  - `createWatcher()` 针对工作区（key = workspaceId 或默认）创建 chokidar watcher。
  - `broadcast()` 将规范化事件（相对路径、按分发策略补充内容）经 `notifyDocs(contentsId, payload)` 推送。
  - 订阅与计数：`addDocsSubscriber()` / `removeDocsSubscriber()` 基于 `webContents.id` 维护订阅计数；最后一个订阅者退出时自动关闭 watcher。
  - 多窗口/多工作区映射：`contentsToWorkspaces` 映射窗口 id → watcher set，窗口销毁时统一清理。
- 路径与内容：
  - 监控目录：工作区根目录下 `agent-docs/`（`resolveBaseDir('agent-docs', workspaceId)`）。
  - 变更事件中，路径以相对 `agent-docs/` 的 POSIX 斜杠表示；`add/change` 会尝试读取内容，`unlink` 不带内容。

预加载边界
- 入口：`src/preload/bridges/docs.ts`（桥构造函数），`src/preload/index.ts`（统一暴露为 `window.api`）。
- 职责：
  - 通过 oRPC 调用 `docs.subscribe/unsubscribe`。
  - 通过 notify 监听 `docs` 主题，将 payload 透传到渲染层回调。
  - 不做权限操作或文件读写。

输入/输出与错误语义
- 订阅：
  - 成功返回 `{ ok: true }`；失败 `{ ok: false, error }`（oRPC 层返回）；桥会在渲染层打印错误并不触发事件。
  - 未传 `workspaceId` 则绑定默认工作区（默认以当前仓库为 root 推导）。
- 事件：
  - `ready` 保证在首次扫描完成后发出，表示可开始消费增量。
  - `error` 表示监控器级别错误，不代表终止；订阅者可选择提示或重试。

并发与状态
- 同一窗口可同时订阅不同工作区；内部以 `{workspaceKey → watcher}` 复用 watcher。
- 同一工作区下多个窗口订阅，共享一个 watcher，按窗口 id 推送事件。
- 取消订阅到 0 时自动关闭 watcher；窗口销毁时统一清理其映射。

安全与约束
- 路径解析与越界防护由主进程 `resolveBaseDir()` 保证；渲染层永不传入绝对路径。
- 监控忽略目录：`.git`、`node_modules`、`*.swp/tmp` 等（见实现）。
- 内容读取失败不会抛出致命错误，将以 `error` 事件上报并继续运行。

可扩展点（建议）
- 批量事件：高频变更时按时间片聚合，降低渲染压力（当前逐条推送）。
- 滞后/去抖：对快速重复写进行合并，减少多次无效刷新。
- 权限策略：对大文件和二进制类型按白名单规则跳过读取内容。

反模式（不允许）
- 渲染层直接读取文件系统以“自修复”状态。
- 预加载层扩大 API 能力（如任意读写路径）。
- 在主进程里为每个窗口单独创建重复 watcher 不做复用。

验收清单
- [ ] 仅通过 `window.api.docs.subscribe` 使用，类型通过。
- [ ] `ready → file/error` 生命周期可复现；取消订阅能释放 watcher。
- [ ] 多窗口/多工作区更改互不串扰。
- [ ] 发生错误时 UI 可得到反馈且不崩溃。
