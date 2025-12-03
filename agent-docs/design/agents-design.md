# Agent 与 Runner 设计文档

> 本文档描述项目中 Agent（业务角色）与 Runner（底层执行器）的分层架构设计。

## 1. 核心概念

### 1.1 概念分离

项目采用 **Agent + Runner** 分离架构：

| 概念 | 层级 | 职责 | 示例 |
|-----|-----|-----|-----|
| **Agent** | 业务层 | 定义角色职责、System Prompt、能力边界 | 需求分析师、架构师、开发者、测试工程师 |
| **Runner** | 技术层 | 实际调用 CLI 工具执行任务 | codex、claude-code、kimi-cli |

**关系**：Agent 通过 Runner 执行任务。例如「开发 Agent」使用「Claude Code」Runner 来实现代码。

### 1.2 设计目标

- **职责分离**：业务逻辑（Agent）与技术实现（Runner）解耦
- **可替换**：同一 Agent 可切换不同 Runner
- **可观测**：统一事件流，支持日志、进度展示
- **安全**：凭证管理在 main 层，renderer 无法直接访问

## 2. Agent 设计

### 2.1 Agent 能力枚举

```ts
// src/shared/agents.ts
export type AgentCapability =
  | 'read_file'    // 读取文件
  | 'write_file'   // 修改文件
  | 'execute_cmd'  // 执行命令
  | 'browse_web'   // 浏览器交互
  | 'search_code'  // 搜索代码库
```

### 2.2 Agent 配置结构

```ts
export interface AgentConfig {
  id: string                        // 唯一标识
  name: string                      // 显示名称
  description?: string              // 描述
  systemPrompt: string              // 定义 Agent 的行为
  capabilities: AgentCapability[]   // 允许的能力
  defaultRunner?: Runner            // 默认使用的 Runner
  outputSchema?: string             // 期望产物格式（YAML schema）
  isPreset?: boolean                // 是否为预设 Agent
}
```

### 2.3 预设 Agent

| ID | 名称 | 能力 | 用途 |
|----|-----|-----|-----|
| `general` | 通用助手 | read_file, write_file, execute_cmd, search_code | 无特定职责约束 |
| `analyst` | 需求分析 Agent | read_file, search_code | 理解用户意图，输出结构化需求 |
| `architect` | 架构 Agent | read_file, search_code | 将需求拆解为可执行任务 |
| `developer` | 开发 Agent | read_file, write_file, execute_cmd, search_code | 按任务清单实现代码 |
| `tester` | 测试 Agent | read_file, execute_cmd, browse_web, search_code | 验证实现是否满足需求 |

### 2.4 Agent 使用流程

```ts
import { getAgent, buildAgentPrompt } from '@/shared/agents'

// 获取 Agent 配置
const agent = getAgent('developer')

// 构建带 System Prompt 的完整 Prompt
const fullPrompt = buildAgentPrompt(agent, userInput)

// 通过 Runner 执行
await runnerService.run({ prompt: fullPrompt, runner: 'claude-code' })
```

## 3. Runner 设计

### 3.1 Runner 类型

```ts
// src/shared/runners.ts
export type Runner =
  | 'codex'              // OpenAI Codex CLI
  | 'claude-code'        // Claude Code（官方）
  | 'claude-code-glm'    // Claude Code + 智谱 GLM
  | 'claude-code-kimi'   // Claude Code + Kimi/Moonshot
  | 'claude-code-minimax'// Claude Code + MiniMax
  | 'kimi-cli'           // Kimi CLI
```

### 3.2 Runner 配置

Runner 配置硬编码在 `src/main/runners/detect.ts`：

```ts
interface RunnerConfig {
  binaries: string[]     // 可执行文件候选名称
  envOverride: string    // 环境变量覆盖路径
  displayName: string    // 显示名称
  baseUrl?: string       // API 基础 URL（第三方供应商）
  tokenEnvKey?: string   // Token 环境变量 key
}

const RUNNER_CONFIGS: Record<Runner, RunnerConfig> = {
  codex: {
    binaries: ['codex', 'openai-codex'],
    envOverride: 'CODEX_BIN',
    displayName: 'Codex'
  },
  'claude-code': {
    binaries: ['claude-code', 'claude'],
    envOverride: 'CLAUDE_CODE_BIN',
    displayName: 'Claude Code',
    tokenEnvKey: 'official'
  },
  'claude-code-glm': {
    binaries: ['claude-code', 'claude'],
    envOverride: 'CLAUDE_CODE_BIN',
    displayName: 'Claude Code (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    tokenEnvKey: 'glm'
  },
  // ... 其他配置
}
```

### 3.3 Runner 实现方式

| Runner | 实现方式 | 说明 |
|--------|---------|-----|
| `claude-code*` | `@anthropic-ai/claude-agent-sdk` | 官方 SDK，类型安全，支持流式 |
| `codex` | CLI spawn + stdio | 原生 CLI 调用 |
| `kimi-cli` | CLI spawn + stdio | 原生 CLI 调用 |

### 3.4 判断是否使用 Agent SDK

```ts
// src/shared/runners.ts
export function isAgentSDKRunner(runner: Runner): boolean {
  return runner.startsWith('claude-code')
}
```

## 4. 运行时架构

### 4.1 目录结构

```
src/main/runners/
├── detect.ts              # Runner 探测与配置
├── claudecode-sdk/
│   ├── index.ts           # 导出
│   └── runner.ts          # Agent SDK 实现
└── codex/
    ├── index.ts           # 导出
    ├── cli.ts             # CLI 参数构建
    └── runner.ts          # CLI spawn 实现
```

### 4.2 事件流

Runner 执行过程中通过 `RunnerEvent` 推送事件：

```ts
// src/shared/types/webui.ts
export type RunnerEvent =
  | { type: 'start'; traceId: string; command: string[]; cwd: string }
  | { type: 'log'; traceId: string; stream: 'stdout' | 'stderr'; data: string }
  | { type: 'text'; traceId: string; text: string; delta: boolean }
  | { type: 'context'; traceId: string; contextId: string }
  | { type: 'claude_message'; traceId: string; messageType: string; content?: string; raw: unknown }
  | { type: 'error'; traceId: string; message: string }
  | { type: 'exit'; traceId: string; code: number | null; signal: string | null; durationMs: number }
```

### 4.3 事件推送机制

```
Runner 执行
    ↓
dispatchEvent()
    ↓
notifyBridge.ts (main)
    ↓
IPC → preload
    ↓
renderer 订阅处理
```

## 5. 可执行文件探测

### 5.1 探测流程

1. 检查环境变量覆盖（如 `CLAUDE_CODE_BIN`）
2. 搜索额外路径（`~/.claude/local`、`~/.local/bin`）
3. 遍历 `PATH` 查找可执行文件
4. 解析 bash wrapper 脚本，找到真正的 JS 可执行文件

### 5.2 版本检测

```ts
// 尝试多种参数获取版本
const tryArgsList = [['--version'], ['version'], ['-v']]
```

### 5.3 DetectResult

```ts
export interface DetectResult {
  name: Runner
  executablePath?: string
  version?: string
}

// 使用示例
const result = await detect('claude-code')
// { name: 'claude-code', executablePath: '/path/to/claude', version: '1.0.0' }
```

## 6. Claude Code SDK 集成

### 6.1 SDK 调用

```ts
import { query, type Options } from '@anthropic-ai/claude-agent-sdk'

const options: Options = {
  cwd: repoRoot,
  env: { ANTHROPIC_API_KEY: token, ... },
  pathToClaudeCodeExecutable,
  permissionMode: 'bypassPermissions',
  includePartialMessages: true
}

const q = query({ prompt, options })

for await (const message of q) {
  // 处理流式消息
}
```

### 6.2 第三方供应商支持

通过设置环境变量切换供应商：

| 供应商 | `ANTHROPIC_BASE_URL` | Token 变量 |
|-------|---------------------|-----------|
| 官方 | （默认） | `ANTHROPIC_API_KEY` |
| 智谱 GLM | `https://open.bigmodel.cn/api/anthropic` | `ZHIPU_API_KEY` |
| Kimi | `https://api.moonshot.cn/anthropic` | `KIMI_API_KEY` |
| MiniMax | `https://api.minimax.chat/v1/text/chatcompletion_v2` | `MINMAX_API_KEY` |

### 6.3 Token 管理

Token 存储在 `src/main/settings/tokens.ts`，通过 `readClaudeTokens()` 读取：

```ts
interface ClaudeTokens {
  official?: string
  glm?: string
  kimi?: string
  minmax?: string
}
```

## 7. Electron 分层

### 7.1 main 层

- 管理 Runner 实例与执行
- 凭证存储与读取
- 暴露 oRPC API 给 preload

### 7.2 preload 层

- 定义类型安全桥接 API
- 转发调用到 main
- 不直接处理敏感数据

### 7.3 renderer 层

- 管理 UI 状态与会话
- 订阅 Runner 事件
- 通过 preload API 发起调用

## 8. API 接口

### 8.1 运行 Runner

```ts
// oRPC contract
runner.run.input({
  prompt: string
  runner: Runner
  projectId?: string
  traceId?: string
  contextId?: string  // 用于恢复会话
  extraArgs?: string[]
})

runner.run.output({
  traceId: string
})
```

### 8.2 取消运行

```ts
runner.cancel.input({ traceId: string })
runner.cancel.output({ ok: boolean })
```

### 8.3 探测 Runner

```ts
runner.detect.input({ runner: Runner })
runner.detect.output({
  name: Runner
  executablePath?: string
  version?: string
})
```

## 9. 术语表

| 术语 | 说明 |
|-----|-----|
| **Agent** | 业务角色，定义职责、System Prompt 和能力边界 |
| **Runner** | 底层执行器，负责调用 CLI 工具 |
| **Trace** | 一次执行的完整轨迹，由 traceId 标识 |
| **Context** | Runner 会话上下文，用于恢复对话 |

---

## 10. 后续演进方向

1. **自定义 Agent**：支持用户创建自定义 Agent 配置
2. **Agent 工作流**：多 Agent 协作的任务编排
3. **Tool 系统**：为 Agent 注册可调用的工具
4. **配置外置**：将 Runner 配置迁移到 JSON 文件
