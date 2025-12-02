# Workspace Store & Preview Hook Refactor Notes

## 背景

Workspace 视图的状态现在拆分为两个 Zustand store：

- `useWorkspaceChatStore`：负责 per-workspace 的会话、消息、Codex 事件。
- `useWorkspacePreviewStore`：负责右侧预览/对话面板的偏好（选中文档、tab、TOC 展开）。

拆分前所有状态共用 `useWorkspaceStore`，随着日志/预览等需求增加暴露出若干问题：

- **持久化压力大**：每次消息/日志更新都会把完整 `sessions` 数组写回 `localStorage`，聊天记录越多，写入越慢。
- **Store 过于粗粒度**：预览面板（`selectedDocPath`、TOC 展开状态）与聊天 session 混在一个 slice，任何小变更都需要复制整个 `workspaces` 对象。
- **确保初始化需要调用方配合**：调用方必须显式调用 `ensure(workspaceId)`，否则 store 可能是 `undefined`，容易遗漏。
- **测试空白**：没有单元测试覆盖 `applyAgentEvent`（运行日志合并）、预览持久化等关键路径。

本笔记记录优化方向与测试计划，方便后续迭代。

## 目标

1. **降低持久化负担**：对聊天/日志数据做分层或裁剪，避免高频写入大对象。
2. **拆分状态切片**：按照功能（chat、preview、ui preference）拆分 store，减少无关 re-render。
3. **自动初始化**：消除外部 `ensure()` 的需求，让 hook 内部保证 workspace entry 一定存在。
4. **增强一致性**：预览 hook (`usePreviewDocument`) 在不同页面中提供统一接口，便于复用。
5. **补齐测试**：为 store reducer/hook 提供回归测试，锁定核心行为。

## 现状总结

| 模块                       | 职责                                                                 | 当前问题                                                                                |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `useWorkspaceChatStore`    | 按 workspace 存储会话/消息，处理 Codex 事件，持久化到 `localStorage` | - Codex 事件仍是 O(n) clone；没有裁剪日志字段；`ensure()` 仍需调用方注入初始会话        |
| `useWorkspacePreviewStore` | 保存预览 tab、选中文档、TOC 展开等 UI 偏好                           | - 仍与聊天 store 解耦，但缺乏自动迁移/版本策略，无法记录更多 UI 偏好（如右侧 tab 组合） |
| `usePreviewDocument`       | 负责 Markdown 渲染、TOC 构建、滚动定位                               | - 渲染逻辑已抽象但缺测试；缺少自定义 renderer/格式扩展能力                              |

## 优化方案

### 1. Store 分层与序列化策略

- **分片持久化**：将 chat sessions 与 preview/ui 偏好拆成独立 store（或同一 store 的多个 slice）并分别 `persist`。例如：
  - `useWorkspaceChatStore`: `sessions`, `activeSessionId`, Codex 事件 reducer。
  - `useWorkspacePreviewStore`: `selectedDocPath`, `rightTab`, `previewTocOpen`, 未来的右侧 tab prefs。
- **消息裁剪**：在序列化前剔除 `logs`/`output` 中的冗余字段，或引入 `IndexedDB`/文件持久化将大对象外部存储，仅在 UI 需要时加载。
- **Immer/selector 优化**：用 `zustand/immer` 或 `set((state) => …)` 减少重复的对象扩展；搭配 selector + shallow compare 降低重渲染。

### 2. 自动初始化 & API 梳理

- 将 `ensure(workspaceId)` 内部化：hook 初始化时若发现 `workspaces[workspaceId]` 不存在，立即创建默认值（并支持 `initializer` 合并）。对外不再暴露 `ensure`。
- 提供更语义化的 API，如 `chatStore.createSession()`, `chatStore.appendMessage()`，避免调用方关心 workspaceId。

### 3. 预览 Hook 统一

- 当前 `usePreviewDocument` 已被 WorkspacePage 与 SpecExplorer 复用。后续可以：
  - 支持自定义渲染器（若未来有代码 diff、HTML 预览等不同格式）。
  - 内部暴露 `setDoc`（已实现）以便 live reload，这部分需文档化，说明 `notifyPath` 的用途。

### 4. 测试补齐

#### Store 层

- `applyAgentEvent`：模拟 `log` / `error` / `exit` 事件，确认 message 状态与日志追加正确。
- `persist` 行为：mock `localStorage`，验证重新 hydrate 后 `rightTab`、`previewTocOpen`、`selectedDocPath` 保持。
- `automatic ensure`：挂载 `useWorkspaceChat`/`Preview` hook 并读取 state，确认无需显式 `ensure` 也能拿到默认 session。

#### Hook 层

- `usePreviewDocument`：
  - 在测试容器中渲染 hook，设置 `doc.content`，断言 `html` 生成与 `toc` 列表。
  - 调用 `setDoc` + `notifyPath:false` 时不触发 `onDocPathChange`。
  - `onTocClick` 能调用 `scrollIntoView`（用 `jest.fn()` mock）。

#### 端到端冒烟

- 通过 React Testing Library / Playwright：
  - 选择 SpecExplorer 中的文件 -> 右侧预览更新 -> 切换 tab -> 切换 workspace -> 状态恢复。
  - 发送 Codex 请求后，模拟 `AgentEvent` 推送，确保右侧 Agent Trace 时间线正常展示。

## 落地步骤建议

1. **定义 store slice 接口**并写设计草图（例如 chatSlice, previewSlice 的 TypeScript interface）。
2. **抽离 preview slice** 到新的 Zustand store（或 `zustand/context`），迁移 `RightPanel` 依赖。
3. **重构 chat events**：引入 `immer` 或消息字典，减少 O(n) 复制；同步更新 persist 逻辑。
4. **编写单元测试**（Vitest/Jest + React Testing Library）：
   - Store reducer 测试。
   - `usePreviewDocument` hook 测试。
5. **添加开发者文档**（本文件 + README 片段），指导如何扩展 store/preview。
6. **视情况引入更适合的存储**（例如 Electron main process + sqlite/IndexedDB）处理大型日志。

## 结语

随着 Workspace 功能拓展，状态管理与可测试性愈发重要。上述分层与测试计划能在不破坏现有 UI/业务逻辑的前提下，逐步提升可维护性。建议在后续迭代中按照“先切 slice、再补测试、最后考虑持久化方案替换”的顺序推进，以降低风险。\*\*\*
