# 迁移至 Claude Agent SDK 分析

## 概述

本文档分析将当前基于 CLI spawn 的 Claude Code 实现迁移至官方 [Agent SDK](https://platform.claude.com/docs/en/agent-sdk/typescript) 的优劣势。

---

## 当前实现方式

当前项目通过 `child_process.spawn` 调用 Claude Code CLI：

```typescript
// src/main/runners/claudecode/runner.ts
const child = spawn(bin, args, {
  cwd: repoRoot,
  env,
  stdio: 'pipe'
})

// 手动解析 JSON Lines 流式输出
child.stdout.on('data', (chunk) => {
  const json = JSON.parse(trimmedLine)
  const extractedText = extractTextFromClaudeMessage(json)
  // ...
})
```

### 当前实现的特点

| 方面 | 描述 |
|------|------|
| 集成方式 | 子进程 spawn + JSON Lines 解析 |
| 消息解析 | 手动解析 `init`, `assistant`, `result` 等类型 |
| 流式处理 | 手动按行分割、缓冲、解析 |
| 进程管理 | 手动处理启动、取消、超时、错误 |
| 上下文续写 | 通过 `--resume` CLI 参数 |
| 配置传递 | 环境变量（`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` 等） |

---

## Agent SDK 实现方式

使用官方 SDK 的典型写法：

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk"

const result = query({
  prompt: "实现这个功能...",
  options: {
    cwd: repoRoot,
    model: "claude-sonnet-4-20250514",
    permissionMode: "acceptEdits",
    mcpServers: { /* ... */ },
    hooks: {
      onMessage: [(msg) => dispatch({ type: 'text', text: msg.content })],
    }
  }
})

for await (const message of result) {
  // 类型安全的消息处理
  if (message.type === 'assistant') {
    // ...
  }
}
```

---

## 迁移优势分析

### 1. 类型安全 ⭐⭐⭐

**现状**：手动定义 `ClaudeJsonMessage` 接口，类型不完整

```typescript
// 当前：手动定义，不完整
interface ClaudeJsonMessage {
  type?: string
  subtype?: string
  message?: { content?: Array<{ type: string; text?: string }> }
  result?: string
  session_id?: string
}
```

**SDK**：完整的 TypeScript 类型定义

```typescript
// SDK 提供完整类型
type SDKMessage =
  | SDKInitMessage
  | SDKUserMessage
  | SDKAssistantMessage
  | SDKResultMessage
  | SDKProgressMessage
  | SDKSystemMessage
  // ... 更多
```

### 2. 流式处理更优雅 ⭐⭐⭐

**现状**：手动处理行缓冲、JSON 解析

```typescript
// 当前：~70 行代码处理流式输出
child.stdout.on('data', (chunk) => {
  const buffer = state.stdoutLineBuffer + data
  const lines = buffer.split(/\r?\n/)
  state.stdoutLineBuffer = lines.pop() ?? ''
  for (const line of lines) {
    try {
      const json = JSON.parse(line)
      // ...
    } catch { /* ... */ }
  }
})
```

**SDK**：原生 AsyncGenerator，开箱即用

```typescript
// SDK：简洁的异步迭代
for await (const message of query({ prompt })) {
  handleMessage(message)
}
```

### 3. 权限管理 ⭐⭐⭐

**现状**：硬编码 `--dangerously-skip-permissions`

```typescript
// 当前：粗暴跳过所有权限
if (!args.includes('--dangerously-skip-permissions')) {
  args.unshift('--dangerously-skip-permissions')
}
```

**SDK**：细粒度权限控制

```typescript
// SDK：灵活的权限模式
options: {
  permissionMode: 'acceptEdits', // 或 'bypassPermissions', 'default'
  allowedTools: ['Read', 'Write', 'Bash'],
  disallowedTools: ['WebFetch'],
  canUseTool: async (tool, input) => {
    // 自定义权限逻辑
    if (tool === 'Bash' && input.command.includes('rm -rf')) {
      return false
    }
    return true
  }
}
```

### 4. 沙箱安全 ⭐⭐

**现状**：无沙箱保护

**SDK**：内置沙箱配置

```typescript
options: {
  sandbox: {
    enabled: true,
    autoAllowBashIfSandboxed: true,
    excludedCommands: ['docker'],
    network: {
      allowLocalBinding: true, // 允许 dev server
    }
  }
}
```

### 5. MCP Server 集成 ⭐⭐⭐

**现状**：不支持

**SDK**：原生支持

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk"

const projectServer = createSdkMcpServer({
  name: 'rantcode-project',
  tools: [
    tool('listProjects', '列出所有项目', z.object({}), async () => {
      const projects = await db.projects.findAll()
      return { content: [{ type: 'text', text: JSON.stringify(projects) }] }
    }),
    tool('runTask', '执行任务', z.object({ taskId: z.string() }), async ({ taskId }) => {
      // ...
    })
  ]
})

const result = query({
  prompt: "列出项目并运行第一个任务",
  options: {
    mcpServers: { project: projectServer }
  }
})
```

### 6. 多 Agent 协作 ⭐⭐

**现状**：单一执行器

**SDK**：支持定义子 Agent

```typescript
options: {
  agents: {
    codeReviewer: {
      description: '代码审查专家',
      prompt: '你是代码审查专家，专注于代码质量和安全性...',
      tools: ['Read', 'Grep'],
      model: 'haiku' // 轻量任务用便宜的模型
    },
    implementer: {
      description: '功能实现者',
      prompt: '你是功能实现专家...',
      tools: ['Read', 'Write', 'Bash'],
      model: 'opus' // 复杂任务用强模型
    }
  }
}
```

### 7. Hook 系统 ⭐⭐

**现状**：事件通过 IPC 发送，无拦截能力

**SDK**：丰富的 Hook 点

```typescript
options: {
  hooks: {
    preToolCall: [(toolName, input) => {
      logger.info(`即将调用工具: ${toolName}`, input)
    }],
    postToolCall: [(toolName, input, output) => {
      analytics.track('tool_used', { toolName, duration: output.duration })
    }],
    onMessage: [(msg) => {
      // 实时消息处理
    }]
  }
}
```

### 8. 会话管理 ⭐⭐

**现状**：通过 `--resume` 和 `session_id` 手动处理

```typescript
// 当前
if (contextId && !args.includes('--resume')) {
  args.push('--resume', contextId)
}
```

**SDK**：更清晰的 API

```typescript
// 恢复会话
const result = query({
  prompt: "继续上次的任务",
  options: { resume: sessionId }
})

// 分叉会话（基于历史创建新会话）
const result = query({
  prompt: "换一种方式实现",
  options: { resume: sessionId, forkSession: true }
})
```

### 9. 结构化输出 ⭐⭐

**现状**：手动解析文本

**SDK**：原生支持 JSON Schema

```typescript
const result = query({
  prompt: "分析这段代码的问题",
  options: {
    outputFormat: {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: {
          issues: { type: 'array', items: { /* ... */ } },
          severity: { enum: ['low', 'medium', 'high'] }
        }
      }
    }
  }
})
```

### 10. 中断控制 ⭐

**现状**：`child.kill()` 粗暴终止

**SDK**：优雅中断

```typescript
const result = query({ prompt, options: { abortController: controller } })

// 优雅中断
await result.interrupt()

// 或使用 AbortController
controller.abort()
```

---

## 迁移劣势分析

### 1. 依赖体积增加 ⚠️

- 需要安装 `@anthropic-ai/claude-agent-sdk`
- 可能引入额外的 Node.js 依赖

### 2. 学习成本 ⚠️

- 团队需要学习新的 API
- 需要理解 SDK 的消息类型、Hook 系统等概念

### 3. 兼容第三方供应商的挑战 ⚠️⚠️

当前项目支持多个供应商（GLM、Kimi、MiniMax），SDK 的兼容性需要验证：

```typescript
// 当前：通过环境变量配置 base URL
env.ANTHROPIC_BASE_URL = 'https://open.bigmodel.cn/api/anthropic'
```

SDK 是否支持自定义 base URL 需要进一步确认。如果不支持，可能需要：
- 继续为第三方供应商使用 CLI spawn 方式
- 或等待 SDK 支持自定义端点

### 4. CLI 安装仍然需要 ⚠️

SDK 底层仍然依赖 Claude Code CLI：

> The SDK must find `claude` in your system PATH, or you can specify a custom path via `pathToClaudeCodeExecutable`.

### 5. 版本耦合 ⚠️

SDK 版本与 Claude Code CLI 版本需要兼容，可能带来升级时的协调问题。

---

## 迁移工作量评估

| 模块 | 工作量 | 说明 |
|------|--------|------|
| `runner.ts` 重构 | 中 | 替换 spawn 为 SDK query |
| 事件系统适配 | 低 | SDK 消息类型与当前事件类型对应 |
| 权限配置 UI | 中 | 新增权限模式选择、工具白名单配置 |
| 类型定义更新 | 低 | 使用 SDK 导出的类型替换自定义类型 |
| 测试更新 | 中 | 更新测试用例适配新 API |
| 第三方供应商兼容 | 高 | 需验证或保留双轨实现 |

**总预估**：3-5 人天（不含第三方供应商兼容性问题）

---

## 建议

### 推荐迁移的场景

1. **需要细粒度权限控制**：用户希望对 AI 操作有更精细的控制
2. **需要 MCP 集成**：计划通过 MCP 扩展工具能力
3. **需要多 Agent 协作**：实现复杂的工作流编排
4. **追求代码简洁性**：减少手动解析的样板代码

### 暂缓迁移的场景

1. **重度依赖第三方供应商**：GLM、Kimi 等非官方 API 的支持
2. **当前实现稳定**：没有新功能需求驱动

### 渐进迁移策略

```
Phase 1: 验证 SDK 兼容性
├── 在独立分支测试 SDK 基本功能
├── 验证第三方供应商支持情况
└── 评估 bundle 体积影响

Phase 2: 双轨并行
├── 官方 Claude API 使用 SDK
├── 第三方供应商保留 CLI spawn
└── 统一事件输出接口

Phase 3: 完全迁移（可选）
├── 等待 SDK 支持自定义端点
└── 或推动第三方提供 SDK 适配
```

---

---

## 迁移完成 ✅

**所有 claude-code 相关 runner 已完全迁移至 Agent SDK 模式**，包括：

- `claude-code` - 官方 Claude API
- `claude-code-glm` - 智谱 GLM
- `claude-code-kimi` - Moonshot Kimi  
- `claude-code-minimax` - MiniMax

### 文件变更

| 文件 | 操作 |
|------|------|
| `src/main/runners/claudecode-sdk/runner.ts` | SDK runner 核心实现 |
| `src/main/runners/claudecode-sdk/index.ts` | 模块导出 |
| `src/main/runners/claudecode/` | **已删除** |
| `src/shared/runners.ts` | 所有 claude-code 都走 SDK |
| `src/main/runners/detect.ts` | 移除单独的 SDK runner 配置 |
| `src/main/runners/codex/runner.ts` | 简化调度逻辑 |
| `src/main/orpcBridge.ts` | 更新导入路径 |

### 实现原理

```typescript
// src/shared/runners.ts
export function isAgentSDKRunner(runner: Runner): boolean {
  return runner.startsWith('claude-code')  // 所有 claude-code 都使用 SDK
}
```

```typescript
// src/main/runners/codex/runner.ts
if (isAgentSDKRunner(runner)) {
  return runClaudeCodeSDKStreaming(targetContentsId, payload)
}
```

### SDK Runner 核心代码

```typescript
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'

const options: Options = {
  cwd: repoRoot,
  env: {
    NO_COLOR: '1',
    ANTHROPIC_BASE_URL: runnerConfig.baseUrl,  // 第三方供应商
    ANTHROPIC_API_KEY: token,
  },
  permissionMode: 'bypassPermissions',
  includePartialMessages: true,
}

const q = query({ prompt, options })

for await (const message of q) {
  if (message.type === 'assistant') { /* ... */ }
  if (message.type === 'result') { /* ... */ }
}
```

### 验证结果

| 项目 | 状态 |
|------|------|
| SDK 安装 | ✅ |
| TypeScript 类型检查 | ✅ |
| 官方 Claude | ✅ |
| GLM / Kimi / MiniMax | ✅ 通过 `ANTHROPIC_BASE_URL` 环境变量 |

---

## 参考资料

- [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Structured Outputs](https://platform.claude.com/docs/en/agent-sdk/structured-outputs)
- [Plugins](https://platform.claude.com/docs/en/agent-sdk/plugins)

