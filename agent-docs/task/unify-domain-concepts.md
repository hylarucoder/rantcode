---
title: 统一领域概念命名
status: done
priority: P1
---

# 统一领域概念命名

## 背景

项目经过多次迭代，领域概念出现了以下问题：

1. **命名不一致**：同一概念在不同地方使用不同名称
2. **概念重叠**：多个概念描述类似的事物但边界模糊
3. **文档滞后**：代码已重构但文档未同步更新

## 当前概念混乱点

### 1. Agent / Runner / Provider 混淆

| 文档中 | 代码中 | 实际含义 |
|--------|--------|----------|
| `Agent` | `Runner` | 执行 AI 任务的 CLI 工具（如 claude-code-glm） |
| `AgentEvent` | `RunnerEvent` | Runner 执行时产生的事件流 |
| `AgentRunOptions` | `RunnerRunOptions` | Runner 执行参数 |
| `Provider` | `Provider` | LLM 服务提供方（如 OpenAI, Anthropic） |

**问题**：
- `agent-docs/spec/core-entities.md` 仍然使用 `Agent` 术语
- `agent-docs/design/data-model.md` 中 `Agent` 和 `Runner` 概念混用
- 部分代码仍有 `agents` 命名残留（如 `@deprecated` 的 bridge）

### 2. Job / Message.traceId / Execution 概念重叠

| 概念 | 定义位置 | 实际用途 |
|------|----------|----------|
| `Job` | `agent-docs/design/data-model.md` | 设计文档中的完整执行实体 |
| `Message.traceId` | 代码实现 | 实际用于追踪执行的字段 |
| `traceId` | `RunnerEvent` | 事件流中的执行标识 |

**问题**：
- 设计文档定义了完整的 `Job` 实体（含 intent, inputDocs, outputDocs 等）
- 但实际代码只用 `Message.traceId` + `Message.status` 简化实现
- `Job` 概念是否需要独立实现？还是用 `Message + traceId` 足够？

### 3. Session 多重含义

| 场景 | 含义 |
|------|------|
| UI 层 `Session` | 用户的一个对话线程，包含多条 Message |
| `Session.runnerSessions[runner]` | 特定 Runner 的 CLI session ID（用于上下文续写） |
| `RunnerEvent.sessionId` | CLI 返回的 session 标识 |

**问题**：
- `Session`（对话会话）和 `sessionId`（CLI 上下文标识）容易混淆
- 建议：CLI 的 session 重命名为 `contextId` 或 `cliSessionId`？

### 4. AgentTrace 定位模糊

| 概念 | 用途 |
|------|------|
| `TraceSession` | 解析后的执行轨迹（用于日志展示） |
| `TraceEvent` | 轨迹中的单个事件 |

**问题**：
- `AgentTrace` 是从日志解析出来的视图，还是独立的领域概念？
- 与 `Job` 的关系是什么？（一个 Job 产生一个 Trace？）

### 5. 角色（Role）概念缺失

当前代码中有 `agentId` 用于选择预设 Agent 角色（如 general, code-review），但：
- 没有明确的类型定义
- 与 `Runner` 概念容易混淆（`agentId` vs `runner`）

## 建议的统一方案

### 核心概念层次

```
┌─────────────────────────────────────────────────────────────┐
│                        Project                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                     Session                          │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │               Message                        │    │    │
│  │  │  - role: user | assistant                    │    │    │
│  │  │  - traceId (assistant only)                  │    │    │
│  │  │  - status, logs, output                      │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Runner: claude-code-glm (执行器)                            │
│  Role: general (角色/人设)                                   │
└─────────────────────────────────────────────────────────────┘
```

### 命名统一表

| 概念 | 统一名称 | 说明 |
|------|----------|------|
| 执行器 | `Runner` | 底层 CLI 工具（codex, claude-code-*） |
| 执行参数 | `RunnerRunOptions` | 传递给 Runner 的参数 |
| 执行事件 | `RunnerEvent` | Runner 产生的事件流 |
| 追踪标识 | `traceId` | 一次执行的唯一标识（已完成重命名） |
| CLI 上下文 | `runnerContextId` | Runner 的 CLI session（用于上下文续写） |
| 角色/人设 | `Role` | 预设的 System Prompt 配置（原 agentId 指向的内容） |
| 执行轨迹 | `AgentTrace` | 解析后的日志，用于展示和调试 |
| 对话会话 | `Session` | UI 层的对话线程 |
| 消息 | `Message` | 会话中的单条消息 |

### 决策结果

1. **Job 实体是否需要独立实现？**
   - ✅ **决策：不需要**，用 `Message + traceId` 足够

2. **CLI 上下文如何命名？**
   - ✅ **决策：`runnerContextId`**

3. **Role 是否需要独立类型？**
   - ✅ **决策：不需要**，保持现状（`agentId` + `getPresetAgent`）

## 执行步骤

1. [x] 讨论并确定上述待决策问题
2. [x] 代码重命名：`runnerSessions` / `sessionId` → `runnerContexts` / `contextId`
3. [x] 更新 `agent-docs/spec/core-entities.md`，统一使用 Runner 命名
4. [x] 更新 `agent-docs/design/data-model.md`，简化 Job 为 Message + traceId
5. [x] 更新 `agent-docs/overview/concepts.md`，添加上下文续写说明

## 相关文档

- [核心实体规范](../spec/core-entities.md)
- [数据模型设计](../design/data-model.md)
- [概念概览](../overview/concepts.md)
- [重命名 jobId → traceId](./rename-jobid-to-traceid.md)


