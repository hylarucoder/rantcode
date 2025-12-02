# Runners 模块边界说明（window.api.runners）

本文定义 Runners（代码执行器，当前包含 Codex/Claude Code/Kimi CLI）在应用中的边界、职责与约束，确保后续扩展与维护有清晰的一致性。

## 目标
- 收敛渲染层能力到最小 API 面，避免直接使用 Electron/Node 特权。
- 明确各层责任划分与数据/事件流向，降低耦合与回归风险。
- 便于扩展更多供应商（vendor），保持一致的输入/输出与可观测性。

## 分层与通道
- 渲染层（Renderer）：仅通过 `window.api.runners` 调用/订阅；不直接访问 Node/Electron。
- 预加载（Preload）：拼装 `window.api`，不包含特权逻辑，仅桥接 oRPC 与 notify 通道。
- 主进程（Main）：实现 oRPC 处理与进程管理、CLI 调用与事件分发。
- 通道：
  - oRPC（双向请求/响应）：`runners.run` 负责启动一次执行，返回 `traceId`。
  - Notify（服务端 -> 渲染端事件）：主题 `codex`，推送流式事件（stdout/stderr/exit 等）。

## 外部接口（Renderer API）
- 入口位置：`src/preload/index.ts:95` 暴露 `window.api`
- 类型声明：`src/preload/index.d.ts:24`
- Runners API：`window.api.runners`（`window.api.agents` 作为 deprecated 别名保留）
  - `run(opts)`：`opts` 为 `RunnerRunOptions`（在 `src/shared/types/webui.ts:166` 声明接口），可附带 `runner?: 'codex' | 'claude-code' | 'kimi-cli'`（在 preload 做了简化包装）。
  - `subscribe(handler)`：订阅 `codex` 主题事件，返回 `unsubscribe()`。
  - `cancel(traceId)`：取消指定 traceId 的执行任务。
- 事件类型：`RunnerEvent`（见 `src/shared/types/webui.ts`）。常见事件：
  - `start`：包含 `traceId`、命令行与 `cwd`。
  - `log`：`stream: 'stdout' | 'stderr'`、文本块（按行拼接，结尾含 `\n`）。
  - `session`：解析到会话 ID（Codex CLI 的 stderr 启动信息）。
  - `error`：运行时错误（无法 spawn、写 stdin 失败等）。
  - `exit`：`code`、`signal`、`durationMs`。

## 主进程实现边界
- oRPC Handler：`src/main/orpcBridge.ts:286` `runners.run`（静态导入 `runCodex`）。
- 执行器：`src/main/runners/codex/runner.ts`
  - 解析 `RunnerRunOptions` → 定位工作目录（`resolveProjectRoot`，基于 `projectId`）。
  - 根据 `runner`（底层执行器）与参数构造最终命令行（`buildCodexArgs`）。
  - `spawn` 子进程，分别处理 `stdout`/`stderr`，按"完整行"分发 `log` 事件。
  - 追踪 `traceId` 与 `sessionId`，在 `exit` 时清理状态，发出最终 `exit` 事件。
  - 成功/失败后通过系统通知（`Notification`）提示（失败不崩溃）。
- 事件分发：`src/main/notifyBridge.ts:29` `notifyCodex(contentsId, payload)` 将结构 `{ topic:'codex', payload }` 经 `MessagePort` 推送给渲染端。

## 预加载边界
- 预加载不做任何特权操作，仅：
  - 建立 oRPC 客户端与 notify 通道：`src/preload/index.ts:1-57`
  - 暴露 `window.api`：`src/preload/index.ts:81-95`
  - 封装 Runners Bridge：`src/preload/bridges/runners.ts:12`（简化 `runner` 的选择、统一订阅接口）。

## 输入/输出与错误语义
- `run()`：
  - 成功返回 `{ traceId }`；参数校验靠 zod schema（`agentRunInputSchema`）完成。
  - 失败（如无有效窗口/参数不合法/主进程异常）直接抛错给调用方（oRPC 层）。
- 事件流：
  - 至少包含 `start` 与随后一个 `exit`（无论 code）。
  - 一般在 `start` 与 `exit` 之间可能收到若干 `log`/`session`/`error`。
  - `error` 为流内错误，不会终止流；最终仍有 `exit`。

## 并发与状态
- 允许同时运行多个 `traceId`（Map 按 `traceId` 管理进程与缓冲）。
- `traceId` 可由调用方传入；若未传入则由主进程生成（`randomUUID()`）。
- 事件以 `traceId` 区分，不存在跨作业串扰。

## 安全与约束
- 渲染层不得拼装命令或触碰文件系统；仅向 `run()` 提供 `prompt/extraArgs/projectId`。
- 主进程限制工作目录：`resolveProjectRoot()` 基于项目ID确保路径安全。
- 执行器检测与路径查找：在各个runner内部处理，按平台解析可执行文件路径与版本。
- 环境变量：在子进程执行时合并 `process.env` 并注入 `NO_COLOR=1`，避免彩色日志影响解析。

## 可扩展点（建议）
- 取消/超时：已实现 `runners.cancel({ traceId })` 与 `timeoutMs`（schema 已预留），主进程按 `kill()` 实现，并发出 `exit`（带 `signal='SIGTERM'|'SIGKILL'`）。
- 事件增强：在所有事件中附带 `runner` 字段，便于 UI 分组与过滤。
- 资源治理：为大文件/长日志做分段限流（字节/行），避免单帧塞爆渲染线程。
- 诊断：在 `start/exit/error` 处写入结构化日志到主进程（现已通过 `loggerService` 输出，可追加字段）。

## 反模式（不允许）
- 在渲染层直接使用 `ipcRenderer` 或引入 Node 模块（文件/子进程/网络）。
- 在预加载层暴露过宽 API（如通用 `eval`/任意文件访问）。
- 在主进程里将业务状态放入全局单例且不通过 `traceId` 区分，导致作业串扰。

## 验收清单（新增/修改时自检）
- [ ] 渲染层仅通过 `window.api.runners` 使用，类型通过。
- [ ] 输入满足 `agentRunInputSchema`，必要字段（`prompt`）已校验。
- [ ] 事件至少包含 `start` 与 `exit`，`log` 为逐行分发（结尾含 `\n`）。
- [ ] 失败路径有 `error` 事件且最终 `exit` 不缺失。
- [ ] 多作业并发互不影响，`traceId` 唯一。
- [ ] 不新增非必要的 IPC 端口；优先复用 oRPC + notify。

---

相关文件索引（便于查看实现）：
- 预加载暴露：src/preload/index.ts:95
- 预加载桥：src/preload/bridges/runners.ts:12
- oRPC 合同：src/shared/orpc/contract.ts
- 类型接口：src/shared/types/webui.ts:166
- oRPC 服务器：src/main/orpcBridge.ts:286
- 执行器与事件：src/main/runners/codex/runner.ts:77
- Notify 通道：src/main/notifyBridge.ts:29
