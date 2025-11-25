## 平台边界（Preload / oRPC / Settings / Notify）

本文梳理应用平台层的总体边界与约束：包含预加载（Preload）公开能力、oRPC 的使用规范、通知通道（Notify）的职责，以及 Settings 的读写与落地位置。

目标
- 统一渲染层访问入口：`window.api`，最小化暴露面与耦合。
- 保持主进程与渲染层的强类型契约（oRPC 合同），避免字符串式调用与 any。
- 将“推送型事件”与“请求-响应调用”分离，提升清晰度与可靠性。

全局 API（Renderer）
- `window.api`（由 Preload 暴露）：
  - `electron`：来自 `@electron-toolkit/preload` 的安全包装（有限 Electron 能力）。
  - `rpc`：`@orpc/client` 的 typed client，契约见 `src/shared/orpc/contract.ts`。
  - `docs`：文档事件桥；`subscribe/unsubscribe` 封装。
  - `agents`：代码执行代理（Codex/Claude Code/Kimi）；`run/subscribe` 封装与 vendor 选择。
  - `logger`：渲染层日志桥（格式化输出 + 上报到主进程）。
  - `initialGeneral`：冷启动时用于主题/语言的初始设置（main 提供）。

Preload 边界
- 仅负责编排：创建 oRPC 客户端、建立 Notify 通道、封装桥，并统一暴露为 `window.api`。
- 不处理特权逻辑或文件系统；不引入长链依赖或状态管理。
- 文件：`src/preload/index.ts`、`src/preload/orpc.ts`、`src/preload/bridges/*`。

oRPC 规范
- 合同：`src/shared/orpc/contract.ts`（使用 `@orpc/contract` 定义）。
- 主进程路由：`src/main/orpcBridge.ts`（使用 `@orpc/server` 标准路由与 `ServerPeer`）。
- 客户端：`window.api.rpc`（typed）；渲染层推荐配合 `@orpc/tanstack-query` 使用。
- 错误转发：主进程在 handler 失败时通过 `orpc:error` 发到渲染层 devtools（仅调试用途）。

Notify（消息端口）
- 建立：`orpc:notify-connect` 单独创建一个 MessagePort，服务端主导向渲染端发送事件。
- 主题：`docs`、`codex` 等，载荷由对应模块定义（DocsWatcherEvent、CodexEvent）。
- 方向：服务端 → 渲染端（单向）；渲染端只订阅不发送。

Settings（读写与应用）
- 数据：通用 UI 设置（主题、语言、缩放、托盘、自动启动等）。
- 读写：
  - 主进程模块：`src/main/settings/general.ts`（依赖 zod schema `generalSettingsSchema`）。
  - oRPC：`app.getGeneral/app.setGeneral`。
  - 冷启动：main 读取早期设置，预加载将 `initialGeneral` 暴露在 `window.api`，渲染侧立即应用主题。
- 约束：不得在渲染层直接访问文件或 electron-store；一切经由主进程/oRPC。

日志与遥测
- 日志：渲染层通过 `window.api.logger`（console 样式化 + `log:to-main` 上报）。
- 遥测：`telemetry:renderer-error` 汇报未捕获异常、未处理拒绝与长任务等（可后续迁移到 Notify）。

安全与约束
- Context Isolation 开启时，所有暴露能力必须通过 `contextBridge.exposeInMainWorld`；避免在预加载出口暴露宽泛 API。
- 渲染层禁止使用 `ipcRenderer` 直连主进程；仅允许通过 `window.api`（oRPC/Notify/有限 Electron）。
- 合同变更（新增/修改端点）须同时更新 `shared/contract.ts` 与 `main/orpcBridge.ts` 实现，并补充 schema。

可扩展点（建议）
- 将 `log:to-main`、`telemetry:renderer-error` 迁移到 Notify（主题 `log/telemetry`），进一步统一 IPC 面。
- oRPC 错误语义：对关键端点定义结构化错误并在渲染端区分处理。
- `window.api` 的“按模块导出”与 tree-shaking：拆分子命名空间的导入工厂以减小包体。

验收清单
- [ ] 仅通过 `window.api` 使用平台能力；禁止直接 ipcRenderer。
- [ ] oRPC 调用与合同/实现保持一致；入参/出参均经 zod 校验。
- [ ] Notify 仅作服务端推送；订阅/退订行为明确且无泄漏。
- [ ] Settings 应用链路：main 读取 → preload 暴露 → renderer 应用，开机即生效。
