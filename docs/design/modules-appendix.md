# 模块补充说明

> 本文列出尚未在主设计文档中详细覆盖的重要模块，作为 `architecture.md` 的补充。后续可视需要将各部分拆分为独立文档。

## 1. Settings 系统 (`src/main/settings/`)

### 模块清单

| 文件 | 职责 |
|------|------|
| `jsonStore.ts` | 通用 JSON 持久化封装，使用 `electron-store` 或文件系统存储配置 |
| `store.ts` | Settings 统一入口，组合 general / tokens / providers |
| `general.ts` | 通用设置（主题、语言、开机自启等） |
| `tokens.ts` | API Key 管理（Anthropic / Kimi / GLM / Minmax） |
| `autoLaunch.ts` | 开机自启逻辑封装 |

### 设计要点

- **安全隔离**：API Key 等敏感数据仅在 main 层处理，渲染层通过 oRPC 读写，不直接接触原始 key 值（可考虑返回 masked 形式给 UI）。
- **Schema 验证**：与 `src/shared/orpc/schemas.ts` 中的 `generalSettingsSchema` / `catalogSchema` 等保持同步，确保前后端类型一致。
- **热更新**：设置变更后通过 `notifyBridge` 通知渲染层刷新（如主题切换）。

---

## 2. oRPC 通信层 (`src/shared/orpc/` + `src/main/orpcBridge.ts`)

### 契约定义 (`contract.ts`)

当前已定义的 RPC 域：

| 域 | 主要过程 |
|----|----------|
| `system` | `health` / `version` |
| `fs` | `tree` / `read`（文件系统访问） |
| `projects` | `list` / `add` / `update` / `remove` / `pickRepoPath` |
| `providers` | `get` / `set`（旧版 Provider 配置，待与 vendors 合并） |
| `vendors` | `getClaudeCode` / `setClaudeCode` / `testClaudeCode` / `runClaudePrompt` |
| `agents` | `get` / `set` / `testCodex` / `info` / `getClaudeTokens` / `setClaudeTokens` |
| `codex` | `run` / `cancel` |
| `app` | `getGeneral` / `setGeneral` / `toggleMaximize` |
| `docs` | `subscribe` / `unsubscribe`（文档变更订阅） |

### 扩展方向

- **批量文件操作**：`fs.write` / `fs.mkdir` / `fs.delete`（目前只有读）
- **Git 集成**：`git.status` / `git.diff` / `git.commit`
- **任务管理**：`task.list` / `task.create` / `task.update`（与 `data-model.md` 中的 Task 实体对应）

---

## 3. 日志系统

### 3.1 主进程日志服务 (`src/main/services/loggerService.ts`)

- 封装日志写入与轮转（可选 `electron-log`）。
- 提供 `info` / `warn` / `error` 等级方法。
- 日志文件默认存放在 `userData/logs/` 下。

### 3.2 渲染层日志解析 (`src/renderer/src/lib/logParsers/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | 日志事件通用类型（ParsedLogEvent） |
| `codex.ts` | 解析 Codex CLI 的 JSONL 日志流 |
| `claudeCode.ts` | 解析 Claude Code 执行日志 |
| `index.ts` | 统一导出，按 Agent 类型分发解析器 |

### 设计要点

- 日志解析器返回统一的 `ParsedLogEvent[]`，便于 `ConversationLog.tsx` / `ExecLogConversation.tsx` 渲染。
- 支持增量解析（流式场景）。

---

## 4. 音效系统 (`src/renderer/src/sound/`)

| 文件 | 职责 |
|------|------|
| `sfxManifest.ts` | 声明所有可用音效及其路径 |
| `soundManager.ts` | 播放控制（preload、play、volume）|

### 资源位置

- `src/renderer/assets/sfx/`：存放 `.wav` / `.mp3` 音效文件。

### 设置集成

- `AudioFxSettings.tsx` / `SfxSettings.tsx` 提供 UI 开关与音量调节。
- 音效偏好持久化到 `general` 设置中。

---

## 5. 文档监控 (`src/main/docsWatcher.ts`)

- 使用 `chokidar` 或原生 `fs.watch` 监听 `docs/` 目录变更。
- 变更事件通过 `notifyBridge` 推送到渲染层，触发 `docs` store 刷新文件树。
- 支持通过 `oRPC.docs.subscribe/unsubscribe` 动态开启/关闭订阅（按 workspace）。

### 未来扩展

- 解析 `docs/task/*.md` frontmatter，自动同步 Task 实体。
- 增量更新 DocRef 索引。

---

## 6. 预览系统 (`src/renderer/src/features/preview/`)

### `usePreviewDocument` Hook

- **输入**：`{ path, content }` 或通过 `oRPC.fs.read` 加载。
- **输出**：
  - `html`：渲染后的 HTML 字符串。
  - `toc`：目录项列表（heading id + text）。
  - `setDoc` / `onTocClick` 等操作方法。
- **依赖**：
  - `lib/markdown.ts`（GFM 解析）
  - `lib/markdownRenderer.ts`（渲染定制：代码高亮、Mermaid）
  - `lib/mermaidRuntime.ts`（Mermaid 图表动态渲染）

### 设计要点

- 与 `useWorkspacePreviewStore` 配合，记住用户选中的文档路径与 tab 状态。
- 渲染在 Web Worker 中异步执行以避免阻塞主线程（可选优化）。

---

## 7. Agent Runners (`src/main/agents/`)

### 7.1 Codex Runner (`agents/codex/runner.ts`)

- **职责**：启动 Codex CLI 子进程，解析 JSONL 事件流，转换为 `CodexEvent`。
- **生命周期**：`run` → `onEvent(callback)` → 事件循环 → `exit` / `cancel`。
- **事件类型**：`session` / `log` / `error` / `exit` / 其他。

### 7.2 Claude Code Runner (`agents/claudecode/runner.ts`)

- **职责**：调用本地 `claude` CLI 或远程 API（根据 vendor 配置）。
- **多后端**：official / kimi / glm / minmax，统一对外暴露 `AgentAdapter` 语义。
- **流式输出**：SSE / stdio 解码为 `AgentDelta`。

### 集成关系

```
Renderer (SessionsView)
   │
   ├──► preload.agentsBridge.run(opts)
   │
   └──► main.orpcBridge.codex.run / claudeCode.run
            │
            ├── codex/runner.ts
            └── claudecode/runner.ts
                    │
                    └── spawn CLI / HTTP request
```

---

## 8. API Hooks 系统 (`src/renderer/src/features/*/api/`)

### 8.1 Workspace API Hooks (`features/workspace/api/hooks.ts`)

- **职责**：提供会话管理的 React Query hooks，封装 oRPC sessions 命名空间。
- **主要 Hooks**：
  - `useSessionsQuery(workspaceId)`：获取会话列表
  - `useSessionQuery(workspaceId, sessionId)`：获取单个会话
  - `useCreateSessionMutation()`：创建新会话
  - `useUpdateSessionMutation()`：更新会话
  - `useDeleteSessionMutation()`：删除会话
  - `useAppendMessagesMutation()`：追加消息到会话
  - `useUpdateMessageMutation()`：更新会话中的消息

### 8.2 Settings API Hooks (`features/settings/api/`)

- **generalHooks.ts**：通用设置管理 hooks
- **agentsHooks.ts**：Agent 配置相关 hooks
- **hooks.ts**：设置管理统一导出

### 8.3 Projects API Hooks (`features/projects/api/hooks.ts`)

- **职责**：项目管理相关的 React Query hooks
- **功能**：项目的增删改查、路径选择等

### 设计要点

- **类型安全**：所有 hooks 都基于 Zod schema，提供完整的类型推导
- **缓存管理**：利用 React Query 的智能缓存和失效策略
- **错误处理**：统一的错误处理和重试机制
- **乐观更新**：Mutation 支持乐观更新，提升用户体验

---

## 9. Git 集成系统 (`features/workspace/components/GitPanel.tsx`)

### 9.1 功能特性

- **实时状态监控**：每5秒自动刷新 Git 状态，显示分支信息和文件变更
- **文件分类展示**：区分已暂存 (staged) 和未暂存 (unstaged) 文件
- **可视化 Diff**：支持 unified 和 split 两种视图模式
- **智能解析**：完整解析 Git diff 格式，包括行号、添加、删除和上下文

### 9.2 组件架构

```typescript
GitPanel
├── 状态展示区 (Header)
│   ├── 分支信息
│   ├── 前进/落后计数
│   └── 刷新按钮
├── 文件列表区 (FileList)
│   ├── 已暂存文件组
│   └── 未暂存文件组
└── Diff 展示区 (DiffView)
    ├── UnifiedDiffView
    └── SplitDiffView
```

### 9.3 oRPC 集成

- `orpc.git.status.queryOptions()`：获取 Git 状态
- `orpc.git.diff.queryOptions()`：获取文件差异
- 自动缓存和失效机制

---

## 10. 重构后的 Workspace 架构

### 10.1 视图分离

原来的 `WorkspacePage` 已重构为：

- `views/ProjectPage.tsx`：项目容器，处理项目级上下文和错误处理
- `views/SessionsView.tsx`：核心聊天功能，从原 WorkspacePage 抽取
- `views/WorkspaceLayout.tsx`：布局管理器，支持多视图切换

### 10.2 ActivityBar 多视图支持

通过 `ActivityBar` 组件支持的视图：
- `sessions`：会话和聊天视图
- `assistant`：Agent 配置面板
- `docs`：文档浏览器
- `git`：Git 集成面板（全屏）
- `settings`：项目设置面板（全屏）

### 10.3 组件清单更新

| 组件 | 路径 | 状态 |
|------|------|------|
| ProjectPage | `views/ProjectPage.tsx` | ✅ 已实现 |
| SessionsView | `views/SessionsView.tsx` | ✅ 已实现 |
| WorkspaceLayout | `views/WorkspaceLayout.tsx` | ✅ 已实现 |
| ActivityBar | `components/ActivityBar.tsx` | ✅ 已实现 |
| GitPanel | `components/GitPanel.tsx` | ✅ 已实现 |
| AssistantPanel | `components/AssistantPanel.tsx` | ✅ 已实现 |
| ProjectSettingsPanel | `components/ProjectSettingsPanel.tsx` | ✅ 已实现 |

---

## 11. 待补充模块

以下模块尚缺少专门设计文档，建议后续迭代时补齐：

| 模块 | 说明 |
|------|------|
| **TTS 系统** | `docs/spec/tts.md` 已有规格，待落地设计与实现 |
| **任务看板 (Kanban)** | 与 `data-model.md` 中 Task 实体配合，提供可视化看板 |
| **多窗口 / 多 Workspace** | 当前单窗口，未来可能需要多窗口状态隔离 |
| **插件 / 扩展机制** | 若要支持自定义 Agent / Tool |
| **Git 操作功能** | 当前只支持查看，待添加 commit/push/pull 等操作 |

---

## 附录：模块路径速查

```
src/
├─ main/
│  ├─ agents/
│  │  ├─ claudecode/     # Claude Code Runner
│  │  ├─ codex/          # Codex Runner
│  │  └─ detect.ts       # Agent 探测（路径、版本）
│  ├─ services/
│  │  └─ loggerService.ts
│  ├─ settings/          # Settings 系统
│  ├─ docsWatcher.ts     # 文档监控
│  ├─ notifyBridge.ts    # 事件通知
│  └─ orpcBridge.ts      # oRPC 服务端
│
├─ preload/
│  ├─ bridges/           # 各功能桥接
│  ├─ orpc.ts            # oRPC 客户端
│  └─ telemetry.ts       # 遥测（可选）
│
├─ renderer/src/
│  ├─ features/
│  │  ├─ logs/           # 日志视图
│  │  ├─ preview/        # 预览 hook
│  │  ├─ projects/       # 项目列表
│  │  │  ├─ api/hooks.ts # 项目管理 API hooks
│  │  │  └─ views/ProjectsPage.tsx
│  │  ├─ settings/       # 设置管理
│  │  │  └─ api/         # 设置 API hooks
│  │  │     ├─ generalHooks.ts
│  │  │   ├─ agentsHooks.ts
│  │  │   └─ hooks.ts
│  │  ├─ spec/           # Spec Explorer
│  │  └─ workspace/      # 工作区核心（重构后）
│  │     ├─ api/hooks.ts # 会话管理 API hooks
│  │     ├─ state/store.ts # Zustand 状态管理
│  │     ├─ views/
│  │     │  ├─ ProjectPage.tsx    # 项目容器
│  │     │  ├─ SessionsView.tsx   # 会话视图
│  │     │  └─ WorkspaceLayout.tsx # 布局管理器
│  │     └─ components/
│  │        ├─ ActivityBar.tsx     # 活动切换栏
│  │        ├─ GitPanel.tsx        # Git 集成面板
│  │        ├─ AssistantPanel.tsx  # 助手配置面板
│  │        ├─ SessionList.tsx     # 会话列表
│  │        ├─ MessageList.tsx     # 消息列表
│  │        ├─ Composer.tsx        # 输入组件
│  │        ├─ RightPanel.tsx      # 右侧面板
│  │        └─ ProjectSettingsPanel.tsx # 项目设置
│  ├─ lib/
│  │  ├─ logParsers/     # 日志解析器
│  │  ├─ markdown*.ts    # Markdown 渲染
│  │  └─ orpcQuery.ts    # React Query 封装
│  ├─ sound/             # 音效系统
│  └─ state/             # 全局状态
│      ├─ workspace/     # Workspace 上下文
│      └─ projects.ts    # 项目状态管理
│
└─ shared/
   ├─ orpc/              # 契约 & Schema
   │  ├─ contract.ts     # oRPC 契约定义
   │  └─ schemas.ts      # Zod 验证 schemas
   └─ types/             # 跨层共享类型
      └─ webui.ts        # 领域模型类型
```

---

> 本文档随项目迭代持续更新。如有重大架构变更，请同步修改 `architecture.md` 与本文件。

