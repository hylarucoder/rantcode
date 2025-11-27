# 核心实体规范：Agent / Session / Message

本文档定义 rantcode 中三个核心实体的规范，用于统一前后端的数据结构和行为约定。

## 概览

```
┌─────────────────────────────────────────────────────────┐
│                      Workspace                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Session 1  │  │  Session 2  │  │  Session 3  │     │
│  │  ┌───────┐  │  │  ┌───────┐  │  │             │     │
│  │  │Message│  │  │  │Message│  │  │   (empty)   │     │
│  │  │Message│  │  │  │Message│  │  │             │     │
│  │  │Message│  │  │  └───────┘  │  │             │     │
│  │  └───────┘  │  │             │  │             │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                         │
│  Agent: claude-code-glm                                │
└─────────────────────────────────────────────────────────┘
```

## 1. Agent（代理/助手）

Agent 代表一个可执行代码任务的 AI 助手后端。

### 1.1 类型定义

```ts
type Agent =
  | 'codex'              // OpenAI Codex CLI
  | 'claude-code'        // Claude Code 原生
  | 'claude-code-glm'    // Claude Code + GLM 后端
  | 'claude-code-kimi'   // Claude Code + Kimi 后端
  | 'claude-code-minimax'// Claude Code + MiniMax 后端
  | 'kimi-cli'           // Kimi CLI

interface AgentUIConfig {
  value: Agent
  label: string       // UI 显示名称
  description?: string // 助手描述
  available?: boolean  // 是否可用（检测到 CLI）
}
```

### 1.2 Agent 职责

| 职责 | 说明 |
|------|------|
| 接收 prompt | 从用户消息中获取任务指令 |
| 执行代码任务 | 调用底层 CLI 工具执行代码生成/修改 |
| 产生事件流 | 输出 `AgentEvent` 流（start/log/exit/session/error） |
| 管理会话上下文 | 可选支持 session 续写（通过 sessionId） |

### 1.3 Agent 事件（AgentEvent）

```ts
type AgentEvent =
  | { type: 'start'; jobId: string; command: string[]; cwd: string }
  | { type: 'log'; jobId: string; stream: 'stdout' | 'stderr'; data: string }
  | { type: 'exit'; jobId: string; code: number | null; signal: string | null; durationMs: number }
  | { type: 'session'; jobId: string; sessionId: string }
  | { type: 'error'; jobId: string; message: string }
  | { type: 'text'; jobId: string; text: string; delta?: boolean }
  | { type: 'claude_message'; jobId: string; messageType: string; content?: string; raw?: unknown }
```

---

## 2. Session（会话）

Session 是用户与 Agent 交互的一个对话线程，用于组织和管理多轮对话。

### 2.1 类型定义

```ts
/**
 * 各 Agent 的 sessionId 映射，支持同一会话切换不同 agent 时保持各自上下文
 * 例如: { "codex": "abc123", "claude-code-glm": "xyz789" }
 */
type AgentSessionMap = Partial<Record<Agent, string>>

interface Session {
  id: string                    // 唯一标识（UUID 或时间戳）
  title: string                 // 会话标题，如 "重构登录页"
  messages: Message[]           // 消息列表
  agentSessions?: AgentSessionMap // 各 agent 的 sessionId 映射（用于上下文续写）
  createdAt?: number            // 创建时间戳
  updatedAt?: number            // 最后更新时间戳
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
                 │  绑定各 Agent   │
                 │  的 SessionId   │
                 └─────────────────┘
```

### 2.3 Session 行为

| 操作 | 说明 |
|------|------|
| `create` | 创建新会话，初始 messages 为空或包含欢迎消息 |
| `select` | 切换当前活跃会话 |
| `rename` | 修改会话标题 |
| `delete` | 删除会话及其所有消息 |
| `bindAgent` | 当 Agent 返回 session 事件时，将 sessionId 写入 agentSessions[agent] |

### 2.4 上下文续写

当 Session 中某个 Agent 已绑定 sessionId 时（存储在 `agentSessions[agent]`），后续使用该 Agent 发送请求会带上对应的 sessionId，使 Agent CLI 能够续写上下文：

```ts
interface AgentRunOptions {
  agent: Agent
  prompt: string
  sessionId?: string  // 来自 Session.agentSessions[agent]
  // ...
}

// 使用示例：
const agentSessionId = activeSession?.agentSessions?.[currentAgent]
run({
  agent: currentAgent,
  prompt: userInput,
  sessionId: agentSessionId  // 根据当前 agent 获取对应的 sessionId
})
```

这样设计的好处：
- 同一会话中可以切换不同的 Agent，每个 Agent 保持独立的上下文
- 切换回之前用过的 Agent 时，可以继续之前的上下文

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
  jobId?: string                // 关联的 Agent Job ID
  status?: MessageStatus        // 执行状态
  logs?: LogEntry[]             // 执行日志（stdout/stderr）
  output?: string               // 最终输出摘要
  errorMessage?: string         // 错误信息
  startedAt?: number            // 开始执行时间戳
  finishedAt?: number           // 完成时间戳
}
```

### 3.2 消息类型对比

| 字段 | User Message | Assistant Message |
|------|--------------|-------------------|
| `role` | `'user'` | `'assistant'` |
| `content` | 用户输入的问题 | Agent 产出的回复 |
| `jobId` | ❌ | ✅ Agent Job 标识 |
| `status` | ❌ | ✅ running/success/error |
| `logs` | ❌ | ✅ CLI 输出日志 |

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
┌─────────────────┐     AgentEvent: log
│ Assistant Msg   │◀────────────────────┐
│ status: running │                     │
│ logs: []        │─────────────────────┘
└────────┬────────┘
         │ AgentEvent: exit
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
│ Composer │────────────────▶│ WorkspacePage│─────────────▶│  Agent   │
└──────────┘                 └──────────────┘              │  Runner  │
                                    │                      └────┬─────┘
                                    │                           │
                              appendMessages()             AgentEvent
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

- **Sessions**: localStorage（per workspace）
- **Messages**: 内嵌在 Session.messages 数组中
- **Agent 配置**: 运行时状态，不持久化

### 5.2 未来考虑

| 实体 | 存储方案 |
|------|----------|
| Session | SQLite / IndexedDB（支持搜索和分页） |
| Message | 同上，独立表，外键关联 Session |
| Agent | electron-store（用户偏好） |

---

## 6. 文件位置

| 实体 | 类型定义文件 |
|------|--------------|
| Agent | `src/shared/agents.ts` |
| Session | `src/renderer/src/features/workspace/types.ts` |
| Message | `src/renderer/src/features/workspace/types.ts` |
| LogEntry | `src/renderer/src/features/workspace/types.ts` |
| AgentEvent | `src/shared/types/webui.ts` |
| AgentRunOptions | `src/shared/types/webui.ts` |

---

## 7. 后续任务

- [ ] 实现 Session 持久化到 SQLite
- [ ] 支持 Session 搜索和过滤
- [ ] 添加 Message 时间戳显示
- [ ] 支持 Message 复制/重发
- [ ] Agent 可用性检测集成到 UI

