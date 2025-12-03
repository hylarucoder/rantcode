# 核心实体规范：Runner / Session / Message

本文档定义 rantcode 中三个核心实体的规范，用于统一前后端的数据结构和行为约定。

## 概览

```
┌─────────────────────────────────────────────────────────┐
│                      Workspace                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │                    Session                       │   │
│  │  ┌───────────────────────────────────────────┐  │   │
│  │  │              Message (user)                │  │   │
│  │  │              Message (assistant)           │  │   │
│  │  │                - traceId                   │  │   │
│  │  │                - status, logs, output      │  │   │
│  │  └───────────────────────────────────────────┘  │   │
│  │  runnerContexts: { "claude-code-glm": "xyz" }   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Runner: claude-code-glm (执行器)                       │
└─────────────────────────────────────────────────────────┘
```

## 术语表

| 术语 | 说明 |
|------|------|
| **Runner** | 底层 CLI 执行器（如 codex, claude-code-glm），负责实际调用 CLI 工具 |
| **Agent** | 用户可配置的 AI 助手，定义职责和 System Prompt（见 `src/shared/agents.ts`） |
| **Session** | 用户的对话会话线程 |
| **Message** | 会话中的单条消息（user 或 assistant） |
| **traceId** | 一次执行的追踪标识，用于关联 RunnerEvent |
| **contextId** | Runner CLI 的上下文标识，用于上下文续写 |
| **RunnerContextMap** | 各 Runner 的 contextId 映射 |

> **Runner vs Agent**：Runner 是技术层概念，Agent 是业务层概念。Agent 通过 Runner 执行任务。
> 示例：「开发 Agent」使用「Claude Code」Runner 来实现代码。

---

## 1. Runner（执行器）

Runner 代表一个可执行代码任务的底层 CLI 工具。

### 1.1 类型定义

```ts
type Runner =
  | 'codex'              // OpenAI Codex CLI
  | 'claude-code'        // Claude Code 原生
  | 'claude-code-glm'    // Claude Code + GLM 后端
  | 'claude-code-kimi'   // Claude Code + Kimi 后端
  | 'claude-code-minimax'// Claude Code + MiniMax 后端
  | 'kimi-cli'           // Kimi CLI

interface RunnerUIConfig {
  value: Runner
  label: string       // UI 显示名称
}
```

### 1.2 Runner 职责

| 职责 | 说明 |
|------|------|
| 接收 prompt | 从用户消息中获取任务指令 |
| 执行代码任务 | 调用底层 CLI 工具执行代码生成/修改 |
| 产生事件流 | 输出 `RunnerEvent` 流（start/log/exit/context/error） |
| 管理上下文 | 可选支持上下文续写（通过 contextId） |

### 1.3 Runner 事件（RunnerEvent）

```ts
type RunnerEvent =
  | { type: 'start'; traceId: string; command: string[]; cwd: string }
  | { type: 'log'; traceId: string; stream: 'stdout' | 'stderr'; data: string }
  | { type: 'exit'; traceId: string; code: number | null; signal: NodeJS.Signals | null; durationMs: number }
  | { type: 'context'; traceId: string; contextId: string }
  | { type: 'error'; traceId: string; message: string }
  | { type: 'text'; traceId: string; text: string; delta?: boolean }
  | { type: 'claude_message'; traceId: string; messageType: 'init' | 'assistant' | 'result' | 'user' | 'system'; content?: string; raw?: unknown }
```

---

## 2. Session（会话）

Session 是用户与 Runner 交互的一个对话线程，用于组织和管理多轮对话。

### 2.1 类型定义

```ts
/**
 * 各 Runner 的 CLI 上下文标识映射，支持同一会话切换不同 Runner 时保持各自上下文
 * 例如: { "codex": "abc123", "claude-code-glm": "xyz789" }
 */
type RunnerContextMap = Partial<Record<Runner, string>>

interface Session {
  id: string                      // 唯一标识（UUID）
  title: string                   // 会话标题，如 "重构登录页"
  messages: Message[]             // 消息列表
  runnerContexts?: RunnerContextMap // 各 Runner 的 contextId 映射（用于上下文续写）
  createdAt?: string              // 创建时间
  updatedAt?: string              // 最后更新时间
}
```

### 2.2 Session 生命周期

```
┌──────────┐     ┌───────────┐     ┌──────────┐
│  创建    │────▶│   活跃    │────▶│  归档    │
│ (empty)  │     │ (对话中)  │     │ (只读)   │
└──────────┘     └───────────┘     └──────────┘
                       │
                       ▼
                 ┌─────────────────┐
                 │ 绑定各 Runner   │
                 │ 的 contextId    │
                 └─────────────────┘
```

### 2.3 Session 行为

| 操作 | 说明 |
|------|------|
| `create` | 创建新会话，初始 messages 为空 |
| `select` | 切换当前活跃会话 |
| `rename` | 修改会话标题 |
| `delete` | 删除会话及其所有消息 |
| `bindContext` | 当 Runner 返回 context 事件时，将 contextId 写入 runnerContexts[runner] |

### 2.4 上下文续写

当 Session 中某个 Runner 已绑定 contextId 时（存储在 `runnerContexts[runner]`），后续使用该 Runner 发送请求会带上对应的 contextId，使 Runner CLI 能够续写上下文：

```ts
interface RunnerRunOptions {
  runner: Runner
  prompt: string
  traceId?: string    // 执行追踪标识
  contextId?: string  // 来自 Session.runnerContexts[runner]
  // ...
}

// 使用示例：
const runnerContextId = activeSession?.runnerContexts?.[currentRunner]
run({
  runner: currentRunner,
  prompt: userInput,
  traceId: generateUUID(),
  contextId: runnerContextId  // 根据当前 Runner 获取对应的 contextId
})
```

这样设计的好处：
- 同一会话中可以切换不同的 Runner，每个 Runner 保持独立的上下文
- 切换回之前用过的 Runner 时，可以继续之前的上下文

---

## 3. Message（消息）

Message 是 Session 中的单条对话记录，分为用户消息和助手消息。

### 3.1 类型定义

```ts
type MessageRole = 'user' | 'assistant'

type MessageStatus = 'running' | 'success' | 'error'

interface LogEntry {
  id: string
  stream: 'stdout' | 'stderr'
  text: string
  timestamp?: number
}

interface Message {
  id: string                    // 唯一标识
  role: MessageRole             // 角色：用户 / 助手
  content: string               // 消息文本内容

  // 以下字段仅 assistant 消息使用
  traceId?: string              // 执行追踪标识（关联 RunnerEvent）
  status?: MessageStatus        // 执行状态
  logs?: LogEntry[]             // 执行日志（stdout/stderr）
  output?: string               // 最终输出摘要
  errorMessage?: string         // 错误信息
  contextId?: string            // Runner CLI 上下文标识
  startedAt?: number            // 开始执行时间戳
  runner?: string               // 执行任务的 Runner
}
```

### 3.2 消息类型对比

| 字段 | User Message | Assistant Message |
|------|--------------|-------------------|
| `role` | `'user'` | `'assistant'` |
| `content` | 用户输入的问题 | Runner 产出的回复 |
| `traceId` | ❌ | ✅ 执行追踪标识 |
| `status` | ❌ | ✅ running/success/error |
| `logs` | ❌ | ✅ CLI 输出日志 |
| `runner` | ❌ | ✅ 使用的 Runner |

### 3.3 Message 状态流转

```
User 发送 prompt
       │
       ▼
┌─────────────────┐
│  User Message   │
│  role: 'user'   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     RunnerEvent: log
│ Assistant Msg   │◀────────────────────┐
│ status: running │                     │
│ logs: []        │─────────────────────┘
└────────┬────────┘
         │ RunnerEvent: exit
         ▼
┌─────────────────┐
│ Assistant Msg   │
│ status: success │
│ logs: [...]     │
└─────────────────┘
```

---

## 4. 数据流示意

```
┌──────────┐    onSend()     ┌──────────────┐    run()     ┌──────────┐
│ Composer │────────────────▶│ SessionsView │─────────────▶│  Runner  │
└──────────┘                 └──────────────┘              └────┬─────┘
                                    │                           │
                              appendMessages()             RunnerEvent
                                    │                           │
                                    ▼                           ▼
                             ┌──────────────┐          ┌──────────────┐
                             │  ChatStore   │◀─────────│  subscribe() │
                             │  (Zustand)   │          └──────────────┘
                             └──────────────┘
                                    │
                                    ▼
                             ┌──────────────┐
                             │ MessageList  │
                             └──────────────┘
```

---

## 5. 存储与持久化

### 5.1 当前实现

- **Sessions**: SQLite（per workspace）
- **Messages**: SQLite，独立表，外键关联 Session
- **Runner 配置**: electron-store（用户偏好）

### 5.2 数据库 Schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  runner_contexts TEXT,  -- JSON 格式的 RunnerContextMap
  archived INTEGER DEFAULT 0,  -- 是否已归档（不删除但隐藏）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX sessions_project_idx ON sessions(project_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  trace_id TEXT,
  status TEXT,
  logs TEXT,           -- JSON 格式的 LogEntry[]
  output TEXT,
  error_message TEXT,
  started_at INTEGER,
  runner TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX messages_session_idx ON messages(session_id);
```

> **注意**：TypeScript 类型中使用 camelCase（如 `errorMessage`），数据库字段使用 snake_case（如 `error_message`）。
> 前端 `Message` 接口中的 `contextId` 和 `logMeta` 字段不直接存储在数据库中，而是通过其他方式获取。

---

## 6. 文件位置

| 实体 | 类型定义文件 |
|------|--------------|
| Runner | `src/shared/runners.ts` |
| Session | `src/renderer/src/features/workspace/types.ts` |
| Message | `src/renderer/src/features/workspace/types.ts` |
| LogEntry | `src/renderer/src/features/workspace/types.ts` |
| RunnerEvent | `src/shared/types/webui.ts` |
| RunnerRunOptions | `src/shared/types/webui.ts` |

---

## 7. 设计决策

### 7.1 不独立实现 Job 实体

设计文档中原本定义了完整的 `Job` 实体，但经过讨论决定：
- **不需要** 独立实现 Job 实体
- 用 `Message + traceId` 足够满足需求
- Job 的概念通过 Message 的 assistant 消息隐式表达

### 7.2 CLI 上下文使用 contextId

为避免与 Session.id 混淆：
- Runner CLI 的上下文标识统一使用 `contextId`
- Session 级别的映射使用 `runnerContexts`
- RunnerEvent 使用 `type: 'context'` 而非 `type: 'session'`
