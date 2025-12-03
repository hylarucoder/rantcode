---
status: done
---

# 重命名 Conversation → AgentTrace

## 背景

当前代码中使用 `Conversation` 来命名 Agent 执行过程的日志解析和渲染模块，但这个词有以下问题：

1. **语义不精确**："Conversation"（对话）暗示双向交流，但实际内容是 Agent 执行任务的完整轨迹，包含工具调用、命令执行、文件修改等
2. **命名散乱**：`ConversationInline`、`ConversationLog`、`ExecLogConversation` 等命名不一致
3. **概念冲突**：与 workspace 的 `session`、`message` 概念容易混淆

## 目标

采用 **AgentTrace** 作为核心命名，语义更准确：
- `Trace` 是业界标准术语（OpenTelemetry、LangSmith 等）
- 明确表达"追踪 Agent 执行轨迹"的含义
- 与现有 session/message 概念清晰区分

## 命名映射

### 领域类型

| 旧命名 | 新命名 | 说明 |
|--------|--------|------|
| `ConversationSession` | `TraceSession` | 一次执行的轨迹 |
| `LogEvent` | `TraceEvent` | 轨迹中的单个事件 |
| `SessionMeta` | `TraceMeta` | 轨迹元信息 |
| `ToolCallData` | `ToolCallData` | 保持不变 |
| `TodoItem` | `TodoItem` | 保持不变 |

### 解析器

| 旧命名 | 新命名 |
|--------|--------|
| `parseConversationLog` | `parseAgentTrace` |
| `parseCodexLog` | `parseCodexTrace` |
| `parseClaudeCodeLog` | `parseClaudeCodeTrace` |
| `conversationLog.ts` | `agentTrace.ts` |
| `lib/logParsers/` | `lib/agentTrace/` |

### 组件

| 旧命名 | 新命名 | 位置 |
|--------|--------|------|
| `ConversationLog` | `AgentTraceTimeline` | `features/logs/components/` |
| `ConversationInline` | `AgentTracePreview` | `features/logs/components/`（移入） |
| `ExecLogConversation` | `ExecAgentTrace` | `features/logs/components/` |
| `ConversationPanel` | 删除（直接用 Timeline） | - |

### 目录结构

```
src/renderer/src/
├── features/
│   └── logs/
│       ├── components/
│       │   ├── AgentTraceTimeline.tsx    # 主视图（原 ConversationLog）
│       │   ├── AgentTracePreview.tsx     # 内嵌预览（原 ConversationInline）
│       │   ├── ExecAgentTrace.tsx        # props 变体（原 ExecLogConversation）
│       │   └── XtermTerminal.tsx
│       └── index.ts
└── lib/
    └── agentTrace/
        ├── index.ts                      # 统一导出
        ├── types.ts                      # TraceSession, TraceEvent, TraceMeta
        ├── codex.ts                      # parseCodexTrace
        └── claudeCode.ts                 # parseClaudeCodeTrace
```

### 外部文件

- `conversation.log` 文件名**保持不变**（这是 Codex CLI 的输出格式，不在我们控制范围内）

## 执行步骤

1. ✅ 创建本 task 文档
2. ✅ 更新 `agent-docs/spec/conversation-log.md` 内的命名
3. ✅ 更新 `agent-docs/design/` 相关文档内的命名
4. ✅ 重命名类型：`ConversationSession` → `TraceSession` 等
5. ✅ 重命名解析器模块：保留 `logParsers/` 目录，更新内部类型和函数名
6. ✅ 重命名组件文件和导出
7. ✅ 删除 `conversation/` 目录，内容移入 `features/logs/`
8. ✅ 更新所有 import 和引用
9. ✅ 验证编译通过，无 lint 错误

## 注意事项

- 保持向后兼容：可以在 `agentTrace/index.ts` 中导出旧名称作为 alias（可选）
- 文档更新：spec 和 design 文档同步更新
- 一次性完成：避免中间状态导致混乱

