# rantcode 数据模型设计（草稿）

> 本文描述 rantcode 在"文档驱动开发 + 无状态回合"的前提下，推荐的数据结构与关系。以概念为主，不绑定具体数据库或持久化实现。

## 1. 概览：核心实体与关系

核心实体：

- `Project`：本地代码仓库。
- `Workspace`：围绕一个 Project 的工作上下文（UI 层概念，可不单独建表）。
- `Task`：驱动重要代码变更的任务卡片（看板里的单元）。
- `Session`：一次或一系列“工作回合”的容器，用来组织用户意图和 agent 作业。
- `Job`：一次具体的 coding agent 调用（无状态回合）。
- `DocRef`：对仓库内文档/文件的引用（路径 + 类型等）。
- `Provider` / `Model`：底层 LLM 提供方与具体模型配置。

关系粗略示意：

- 一个 `Project` 拥有多个 `Task` / `Session` / `Job` / `DocRef`。
- 一个 `Task` 可以关联多个 `Session` 和多个 `Job`（实现该任务的不同回合）。
- 一个 `Session` 包含多个 `Job`（一次对话式工作流的多轮尝试），但对用户表现为“按回合记录”。
- 一个 `Job` 可以引用多个 `DocRef`（输入/输出涉及的文档或代码文件）。

## 2. Project 与 Workspace

### Project

```ts
type ProjectId = string

interface Project {
  id: ProjectId
  name?: string
  repoPath: string // 本地仓库绝对路径
  createdAt: string
  updatedAt: string
}
```

**实现状态：✅ 已实现**

说明：

- Project 是 rantcode 的入口实体，对应首页列表里的项目卡片。
- **前端实现**：`features/projects/` 完整的项目管理功能
- **状态管理**：`state/projects.ts` 提供项目状态管理
- **API 集成**：`projects/api/hooks.ts` 提供完整的 CRUD 操作
- Workspace 主要是 UI 层概念（当前打开的 Project），通过 `WorkspaceProvider` 提供上下文。

## 3. Task：看板任务

> 所有“对代码有影响的较大变更”都应当通过 Task 进入。

```ts
type TaskId = string

type TaskStatus = 'backlog' | 'in-progress' | 'review' | 'done' | 'blocked'

interface Task {
  id: TaskId
  projectId: ProjectId
  title: string
  descriptionDoc?: DocRefId // 对应 docs/task/*.md 中的某一条/某一节
  status: TaskStatus
  priority?: 'P0' | 'P1' | 'P2'
  owner?: string

  // 关联的 Session / Job
  sessionIds: SessionId[] // 与这个任务相关的工作会话（例如"实现""review""补文档"）

  createdAt: string
  updatedAt: string
}
```

**实现状态：⚠️ 设计阶段**

说明：

- Task 是"看板卡片"，同时也是"变更的入口和容器"：
  - 在 UI 的 Kanban 视图中展示。
  - 在 Diff/Review 视图里可以按 Task 过滤。
- `descriptionDoc` 用于把 Task 实体与 `docs/task/` 中的文档条目关联起来。
- **当前状态**：数据模型设计完成，待实现前端看板 UI 和后端存储。

## 4. DocRef：文档与文件引用

```ts
type DocRefId = string

type DocKind = 'overview' | 'design' | 'spec' | 'task' | 'code' | 'other'

interface DocRef {
  id: DocRefId
  projectId: ProjectId

  kind: DocKind
  path: string // 相对于 repo 根的路径，如 docs/spec/foo.md 或 src/app/index.ts
  title?: string // 解析自文档/文件的标题（如一级 heading 或文件名）

  // 可选：定位到文档的某一节/片段
  anchor?: string // heading id / fragment
}
```

**实现状态：⚠️ 设计阶段**

说明：

- DocRef 是"rantcode 眼中的文档/文件"抽象：
  - 方便在 Task、Session、Job 中引用而不用重复存路径字符串。
  - 未来可以用来做"某一节 Spec / Task 的精确引用"。
- **当前状态**：概念设计阶段，部分文件路径功能通过现有的文件系统 API 实现。

## 5. Session：工作回合容器

> Session 不等于聊天记录，而是一次或多次“工作回合”的容器。

```ts
type SessionId = string

interface Session {
  id: SessionId
  projectId: ProjectId

  title: string // 给人看的名字，例如“登录页重构 - 实现回合”
  kind: 'task' | 'docs' | 'qa' // 与 Task 绑定 / 文档创作 / 纯问答

  taskId?: TaskId // 若是 task 相关会话，则指向对应 Task

  // 这次会话涉及的文档/文件上下文
  contextDocs: DocRefId[]

  // 与本会话关联的 agent 回合
  // 执行追踪通过 Message.traceId 关联

  // 人类侧的输入记录（文字/未来语音转文字）
  messages: {
    id: string
    role: 'user' | 'assistant-summary'
    content: string // 用户意图 / agent 产出的摘要
    createdAt: string
  }[]

  createdAt: string
  updatedAt: string
}
```

**实现状态：🚧 部分实现**

说明：

- Session 主要帮助用户"逻辑分组"工作回合：
  - Task 相关 Session：围绕某一张 Task 卡片的实现/补文档/回顾。
  - Docs 相关 Session：用于新建/重写文档草稿。
  - QA Session：纯问答，不改代码。
- 真正与 coding agent 强绑定的是 Job（下一节）。
- **当前实现**：
  - ✅ 前端 `Session` 类型和 UI 组件完整实现
  - ✅ `features/workspace/api/hooks.ts` 提供完整的后端同步 API
  - ✅ `workspace/state/store.ts` 提供本地状态管理
  - ⚠️ 与 Task 的关联待实现

## 6. ~~Job~~ → Message + traceId

> **设计决策：不独立实现 Job 实体**
> 
> 经过讨论，决定用 `Message + traceId` 替代独立的 Job 实体。
> 原因：当前需求用 Message 的 assistant 消息已足够表达执行概念。

### 6.1 traceId 的作用

`traceId` 是一次 Runner 执行的追踪标识，用于：
- 关联 `RunnerEvent` 事件流与具体消息
- 构建执行日志索引
- 支持系统通知（任务完成/失败）

### 6.2 实现方式

```ts
interface Message {
  // ...
  traceId?: string        // 执行追踪标识（关联 RunnerEvent）
  status?: MessageStatus  // 'running' | 'success' | 'error'
  logs?: LogEntry[]       // 执行日志
  output?: string         // 最终输出
  runner?: string         // 使用的 Runner
  startedAt?: number      // 开始时间
}
```

**实现状态：✅ 已实现**

- ✅ `Message` 中的 `traceId` 和 `status` 字段实现执行跟踪
- ✅ Runner CLI 执行和事件流处理完整实现
- ✅ 系统通知集成（成功/失败提示）
- ✅ SQLite 持久化存储

## 7. Provider / Model：底层模型配置

```ts
type ProviderId = string
type ModelId = string

interface Provider {
  id: ProviderId
  name: string // 如 "OpenAI", "Anthropic", "Local Ollama"
  type: 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom'
  baseUrl?: string
  models: ModelConfig[]
}

interface ModelConfig {
  id: ModelId // 调用时使用的模型 id
  label: string // 给人看的名字，如 "GPT‑5.1", "Claude 4.5 Sonnet"
  capabilities?: string[] // 可选：["code", "review", "plan"]
  defaultMaxTokens?: number
}
```

**实现状态：✅ 已实现**

说明：

- Provider / Model 数据可以基本沿用当前 Settings 页的设计，只是显式化 ID 和能力标签。
- Job 通过 `providerId + modelId` 指向具体模型，Session / Task 只看到"策略名"即可。
- **当前实现**：
  - ✅ Settings 页面完整的 Provider/Model 配置管理
  - ✅ 多种 Runner 类型支持（Codex, Claude Code GLM, Claude Code Official 等）
  - ✅ 配置验证和测试功能

## 8. 设计原则回顾

1. **文档驱动，而不是聊天驱动**
   - Task / Spec / Docs 是一等公民；
   - Session / Job 始终要能追溯到具体文档和任务。

2. **Job 无状态，Session 管理“回合”而非对话细节**
   - 每个 Job 都带完整 intent + context；
   - Session 用来组织 Job 和对用户可见的摘要，不暴露内部多轮对话。

3. **Task 是大变更的唯一入口**
   - 任何对代码有影响的重大改动应该挂在某个 Task 上；
   - Kanban / Work 视图可以基于 Task 数据提供全局视角。

4. **通知只关心 Job 生命周期**
   - 简化用户心智：收到通知 ≈ 某个 Task / Session 的一次回合已完成，可以回来 review。

## 9. 实现状态总览

### 实现进度

| 实体 | 状态 | 主要实现 |
|------|------|----------|
| **Project** | ✅ 已实现 | `features/projects/` + `projects/api/hooks.ts` |
| **Session** | ✅ 已实现 | `Session` 类型 + API Hooks + SQLite 持久化 |
| **执行追踪** | ✅ 已实现 | `Message.traceId` + Runner 执行 + 事件流 |
| **Provider/Model** | ✅ 已实现 | Settings 页面完整配置管理 |
| **Task** | 🚧 部分实现 | `KanbanPanel` 看板视图 + frontmatter 解析 |
| **DocRef** | ⚠️ 设计阶段 | 概念设计，文件系统 API 部分支持 |

### 新增基础设施

- **API Hooks 系统**：完整的 React Query 封装，提供类型安全的数据访问层
- **Git 集成**：`GitPanel` 提供完整的 Git 状态查看和 diff 功能
- **重构架构**：`ProjectPage` + `SessionsView` + `WorkspaceLayout` 的分层架构
- **ActivityBar**：支持多视图切换的导航系统（sessions/assistant/docs/git/kanban/settings）
- **Kanban 看板**：`KanbanPanel` 提供任务拖拽和状态管理

### 下一步重点

1. **Session-Task 关联**：建立会话与任务的关联关系
2. **结构化存储**：完善 Job 实体的持久化存储
3. **DocRef 精确引用**：实现文档级别的精确定位和引用
4. **Task 新建功能**：支持在看板中新建任务文件

> 后续可以在 `docs/design/*.md` 中补充：
>
> - Job 执行管线（队列 / 重试 / 失败策略）；
> - 与 Git 的集成方式（diffRef 的具体含义）；
> - 如何从 docs/task 中同步/生成 Task 实体。
