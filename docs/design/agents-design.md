# Agents 抽象层设计与集成指南

> 目标：为多类 Agent（rantcode、codex、claude-code、Kimi CLI）提供一致的编程接口和运行时管理，使你可以在不改动上层业务的情况下自由切换和组合。

## 1. 目标与范围

- 统一：用一个 `AgentAdapter` 接口抽象不同实现（本地进程/守护、HTTP/WS 服务、OpenAI 兼容或非兼容 LLM）。
- 可替换：通过 `AgentRegistry`/`AgentFactory` 按配置动态装配与切换实现。
- 可观测：标准化日志、事件、流式增量、错误与重试策略。
- 安全：凭证管理、权限边界（尤其工具调用）、超时/资源限额。
- 贴合 Electron 工程：在 main/preload/renderer 各层分工明确，避免跨层越权。

不在本版范围：分布式任务编排、跨租户多实例调度、完整 APM/Tracing 平台（预留挂点）。

## 2. Agent 分类与典型接入

1. rantcode（你自研/自定义的 Agent）

- 形态：命令行一次性进程或后台守护（可选 HTTP/WS）。
- 接入：优先 `ProcessAgentAdapter`（spawn/stdio 行级 JSON），也可 `HttpAgentAdapter`。

2. codex（Codex CLI/本地执行器）

- 形态：本地运行、具备工具调用和计划执行能力。
- 接入：`ProcessAgentAdapter` 或（如提供本地端口）`HttpAgentAdapter`。
- 配置：无需显式配置（自动探测路径与版本）。
- 展示：在 UI 中显示已探测到的可执行路径与版本号。

3. claude-code（统一入口，需支持四种后端：official / kimi / glm / minmax）

- 形态：同一套“Claude Code”调用语义，不同模型/供应商后端。
- 接入：
  - official：Anthropic 官方 API（建议 `ProviderSpecificAdapter`；或做兼容层）。
  - kimi：Kimi/Moonshot 提供的 API（若 OpenAI 兼容可走 `OpenAICompatibleAdapter`）。
  - glm：智谱 GLM（多为 OpenAI 兼容变体，可走 `OpenAICompatibleAdapter`，必要时设定路径差异）。
  - minmax：Minimax（大多兼容/半兼容，建议尝试 `OpenAICompatibleAdapter`，不兼容则 `ProviderSpecificAdapter`）。
- 说明：在 `ClaudeCodeAdapter` 内以 `provider` 字段切换后端；统一对外暴露 `AgentAdapter` 接口。
- 配置：CLI 需展示可执行路径与版本；四种后端仅需提供 token（默认使用各供应商标准 baseUrl 与推荐模型）。

4. Kimi CLI（Kimi 的本地 CLI 形态）

- 形态：命令行/本地进程，通过 stdio 交互。
- 接入：`ProcessAgentAdapter`（推荐）。

## 3. 总体架构

- AgentAdapter（核心接口）：统一 `init/call/stream/tools/dispose` 等生命周期与调用语义。
- Transport 层：`ProcessTransport`、`HttpTransport`、`WsTransport`（超时、重试、SSE/事件解码）。
- Protocol 层：OpenAI Chat、JSON-RPC、自定义 JSON over stdio、SSE。
- Registry/Factory：按配置创建实例，支持热插拔与按需复用连接。
- ToolRuntime：统一工具注册/执行与安全沙箱，隔离文件系统/网络权限。
- ConversationStore：管理会话/上下文/缓存（可选）。
- Auth 管理：API Key、Token、签名策略、密钥来源（env/安全存储）。

运行时信息展示（路径与版本）：

- 为 `codex` 与 `claude-code` 增加运行时探测（可执行路径、版本号），用于 UI/日志展示。

## 4. 核心数据模型（TypeScript 草案）

```ts
// 角色与消息
export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ContentPartText {
  type: 'text'
  text: string
}
export interface ContentPartImage {
  type: 'image'
  url: string
  mime?: string
}
export type ContentPart = ContentPartText | ContentPartImage

export interface AgentMessage {
  role: Role
  content: ContentPart[] // 文本/图片等多模态
  toolCalls?: ToolCall[]
  name?: string // 可选：指定工具/函数名或助手名称
  metadata?: Record<string, any>
}

// 工具与函数调用
export interface ToolSchema {
  name: string
  description?: string
  parameters: Record<string, any> // JSON Schema 片段
}

export interface ToolCall {
  id: string
  name: string // tool name
  arguments: Record<string, any>
}

export interface ToolHandler {
  schema: ToolSchema
  handle: (args: Record<string, any>, ctx: RunContext) => Promise<any>
}

export interface RunContext {
  traceId?: string
  signal?: AbortSignal
  tags?: string[]
  // 安全：文件/网络/环境变量访问，由调用侧严格控制
}

// 调用入参与返回
export interface AgentTurn {
  messages: AgentMessage[]
  tools?: ToolSchema[]
  model?: string
  temperature?: number
  topP?: number
  maxTokens?: number
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string }
  metadata?: Record<string, any>
}

export interface AgentResult {
  message: AgentMessage // 最终汇总
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error'
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
  raw?: any // 供应商原始响应，便于排错
}

export interface AgentDelta {
  type: 'text' | 'tool_call' | 'event'
  textDelta?: string
  toolCallDelta?: Partial<ToolCall> & { id: string }
  event?: { name: string; payload?: any }
}

// 适配器核心
export interface AgentAdapter {
  id: string
  kind: 'process' | 'http' | 'ws' | 'openai_compatible' | 'provider_specific'
  init(): Promise<void>
  dispose(): Promise<void>
  supportsStreaming(): boolean
  call(turn: AgentTurn, ctx?: RunContext): Promise<AgentResult>
  stream?(turn: AgentTurn, ctx?: RunContext): AsyncIterable<AgentDelta>
  tools?(): ToolSchema[] // 该 Agent 内置工具声明（如 Codex）
  info?(): Promise<AgentInfo> // 可选：返回路径、版本、provider 等运行时信息
}

export interface AgentInfo {
  name: string // 如 'codex', 'claude-code'
  provider?: string // claude-code: 'official' | 'kimi' | 'glm' | 'minmax'
  executablePath?: string // 可执行路径（如 /usr/local/bin/codex）
  version?: string // 语义化版本/构建号
  model?: string // 使用的模型（可选）
}
```

## 5. Adapter 设计要点

### 5.1 ProcessAgentAdapter（本地命令行/进程）

- 通过 `child_process.spawn` 启动；协议可采用：
  - 行级 JSON（每行一个 JSON 对象），便于流式解析；
  - 或者纯请求-响应 JSON（stdio），简化对接。
- 超时/内存/CPU 限额，异常时自动清理子进程；支持重启。
- 流式输出：按行/块解码为 `AgentDelta`。

### 5.2 HttpAgentAdapter / WsAgentAdapter（守护/云服务）

- HTTP：`POST /chat` 同步响应，或 `text/event-stream` 推流。
- WS：建立会话后推送 delta 事件；需心跳与重连策略。
- 统一鉴权：Bearer Token、API Key、签名头；重试与幂等（幂等键/重放保护）。

### 5.3 OpenAICompatibleAdapter（官方/国产兼容协议）

- 统一 Chat Completions / Responses API 与 SSE 解析；
- 工具调用：映射为 OpenAI function/tool schema；收敛 `tool_choice` 行为；
- 供应商差异通过 `capabilities`/特性开关处理（如 max tokens、响应字段差异）。

### 5.4 ProviderSpecificAdapter（非兼容协议）

- 封装各家 SDK/REST；在适配器内转换为统一 `AgentResult/AgentDelta`。
- 建议：尽量转为 OpenAI 风格以减少上层差异。

## 6. 工具（Tool）与函数调用

- 统一工具注册：`ToolRuntime` 维护 `name -> handler` 映射与 JSON Schema；
- 执行策略：
  - `tool_choice:auto`：由模型决定是否调用工具；
  - `tool_choice:none`：禁止工具；
  - 指定工具：只允许命名工具。
- 安全：工具执行位于可信层（Electron main/preload），严禁 renderer 直接触达高权限操作（FS/Network/Shell）。
- 结果回传：工具结果编码为 `role: 'tool'` 的消息，纳入后续模型对话。

## 7. 配置与注册（示例）

建议新建 `agents.config.json`（或等效 TS 配置）统一管理：

```json
{
  "defaultAgent": "openai-gpt-4o-mini",
  "agents": {
    "rantcode": {
      "type": "process",
      "command": "node",
      "args": ["./local/rantcode-agent.js"],
      "env": { "AGENT_MODE": "cli" },
      "timeoutMs": 120000
    },
    "codex": {
      "type": "process",
      "auto": true,
      "detect": {
        "commands": ["codex"],
        "versionArgs": ["--version", "version"]
      }
    },
    "claude-code-official": {
      "type": "provider_specific",
      "provider": "official",
      "apiKeyEnv": "ANTHROPIC_API_KEY"
    },
    "claude-code-kimi": {
      "type": "openai_compatible",
      "provider": "kimi",
      "apiKeyEnv": "KIMI_API_KEY"
    },
    "claude-code-glm": {
      "type": "openai_compatible",
      "provider": "glm",
      "apiKeyEnv": "ZHIPU_API_KEY"
    },
    "claude-code-minmax": {
      "type": "openai_compatible",
      "provider": "minmax",
      "apiKeyEnv": "MINMAX_API_KEY"
    },
    "kimi-cli": {
      "type": "process",
      "command": "<kimi cli 可执行文件>",
      "args": ["--stdio"],
      "env": { "KIMI_API_KEY": "${KIMI_API_KEY}" },
      "timeoutMs": 120000
    }
  }
}
```

`AgentRegistry` 读取配置 → `AgentFactory` 实例化 → 暴露 `get(id)`/`useDefault()`。

## 8. 生命周期与上下文

- init：预热连接/会话，探测能力（工具、最大上下文、令牌限额）。
- keepalive：WS 心跳、HTTP 健康检查；失败自动重建。
- 取消：支持 `AbortSignal`；中止本地进程或 HTTP 请求。
- 并发与速率：队列/限流器；供应商速率限制与退避重试（指数退避）。

路径与版本探测（codex / claude-code 专用）：

- 可执行路径：优先读取配置显式路径；未配置则按 `process.env.PATH` 通过 `which`/`where` 探测。
- 版本号：尝试以 `--version`、`version` 等参数调用，解析 `semver` 或构建号；失败则回退为原始文本显示。
- 展示：在 UI/日志中统一通过 `AgentAdapter.info()` 返回的 `executablePath` 与 `version` 展示。

## 9. 错误处理与降级

- 分类：输入校验、网络/超时、鉴权、配额、解析、供应商错误、工具执行错误。
- 策略：
  - 可重试错误：退避重试，带幂等键；
  - 不可重试：快速失败 + 诊断信息；
  - 回退：主模型失败→备用模型；流失败→切换非流式。

## 10. 观测与日志

- 事件：`run.start`/`run.delta`/`run.finish`/`run.error`；
- 结构化日志：包含 `traceId`、agentId、模型名、延迟、令牌用量；
- 挂点：可接入 APM/Tracing（OpenTelemetry）与本地日志文件。

## 11. 在 Electron 项目中的分层落地

- main（Node 权限层）：
  - 管理 `AgentRegistry`/`AgentAdapter` 实例与 ToolRuntime；
  - 执行高权限工具（FS/Network/Shell）；
  - 暴露安全 IPC/API 给 preload。
- preload（桥接层）：
  - 定义类型安全 API，转发到 main；
  - 做最小化的数据校验与序列化；
  - 不直接做高权限操作。
- renderer（UI 层）：
  - 管理会话与流式渲染；
  - 不直接接触凭证/文件系统；
  - 通过 preload API 发起调用与订阅事件。

## 12. 最小可用实现（MVP）建议

1. 落地核心接口：`AgentAdapter`、`AgentTurn`、`AgentResult`、`AgentDelta`。
2. 实现 `OpenAICompatibleAdapter`（覆盖官方与主流国产兼容厂商）。
3. 实现 `ProcessAgentAdapter`（对接你现有 CLI/后台进程）。
4. 做一个 `ToolRuntime`（内置 1~2 个安全工具，如只读 FS）。
5. 加上 `AgentRegistry` + JSON 配置解析。
6. 在 main 层提供 IPC API：`callAgent` / `streamAgent`；renderer 做简单 UI 验证。

## 13. 术语表

- Agent：具备推理/编排/工具调用能力的执行体。
- Adapter：将具体实现（进程/HTTP/LLM）映射为统一接口的适配器。
- Tool：受控的函数/操作，由 Agent 触发、由受信侧执行。
- Turn：一轮调用，包含上下文消息与参数，在统一接口中执行。
- Delta：流式增量片段，用于逐步渲染与交互。

---

如需，我可以基于此文档直接生成 `src/main/agents/` 的初始代码骨架（接口 + 适配器空实现 + Registry/Factory + preload 桥接）。

## 14. claude-code 集成说明（official / kimi / glm / minmax）

- 统一入口：`ClaudeCodeAdapter`，通过 `provider` 切换后端，保持对上层 `AgentAdapter` 一致语义。
- official（Anthropic）：仅需 `ANTHROPIC_API_KEY`；默认使用官方标准 baseUrl 与推荐模型。
- kimi / glm / minmax：仅需各自 token（`KIMI_API_KEY`、`ZHIPU_API_KEY`、`MINMAX_API_KEY`）；默认使用各供应商标准 baseUrl 与推荐模型。
- 统一流式：将 SSE/WS/分片文本解码为 `AgentDelta`（text/tool_call/event）。
- 令牌/模型：如需自定义模型，可在调用时通过 `AgentTurn.model` 覆盖；计费/用量通过 `usage` 统一回传。

## 15. Kimi CLI 对接说明

- 接入：`ProcessAgentAdapter`，通过 stdio 行级 JSON 帧或纯文本流（建议前者）。
- 建议的 stdio 帧格式（可协商）：
  - 请求：`{ "type": "call", "id": "<traceId>", "messages": [...], "stream": true }`
  - 增量：`{ "type": "delta", "id": "<traceId>", "delta": { "type": "text", "text": "..." } }`
  - 结束：`{ "type": "final", "id": "<traceId>", "message": { ... }, "usage": { ... } }`
- 凭证：通过环境变量传入（如 `KIMI_API_KEY`），仅在 main 层注入。
- 路径与版本展示：同 codex/claude-code 的探测流程（可执行路径 + `--version`）。
