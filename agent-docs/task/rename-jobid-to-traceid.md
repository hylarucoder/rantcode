---
title: 重命名 jobId → traceId
status: done
priority: P3
---

# 重命名 jobId → traceId

## 背景

当前代码中使用 `jobId` 来标识一次 Agent 执行，但这个命名存在以下问题：

1. **语义模糊**：`job` 是通用词，容易联想到后台任务队列、定时任务等概念
2. **概念割裂**：项目已经采用 `AgentTrace` 体系（`TraceSession`、`TraceEvent`），但 `jobId` 与之不一致
3. **业界惯例**：追踪系统普遍使用 `traceId`（OpenTelemetry、LangSmith、Jaeger 等）

## 目标

将 `jobId` 统一重命名为 `traceId`，与项目的 AgentTrace 概念体系保持一致。

## 命名映射

### 类型和字段

| 旧命名 | 新命名 | 说明 |
|--------|--------|------|
| `jobId` | `traceId` | 一次 Agent 执行的唯一标识 |
| `job_id` | `trace_id` | 数据库字段名 |
| `runningJobId` | `runningTraceId` | 当前正在执行的 traceId |
| `jobIndex` | `traceIndex` | store 中的索引 |
| `jobRef` | `traceRef` | 索引引用 |

### 概念对齐

```
Session (会话)
  └── Message (消息)
        └── traceId ──────┐
                          │
RunnerEvent               │
  └── traceId ────────────┤  同一个 traceId 关联消息和事件
                          │
TraceSession (解析后)     │
  └── 对应同一次执行 ─────┘
```

## 影响范围

### 1. 共享类型定义

- `src/shared/types/webui.ts` - `RunnerEvent`、`RunnerRunOptions`
- `src/shared/orpc/schemas.ts` - `messageSchema`、`agentRunInputSchema`
- `src/shared/orpc/contract.ts` - API 契约

### 2. 数据库层

- `src/main/db/schema.ts` - messages 表的 `job_id` 字段
- `src/main/db/client.ts` - 迁移脚本中的字段名
- `src/main/db/services/sessionService.ts` - 服务层
- `src/main/db/repositories/session.ts` - 仓库层
- `src/main/db/migrate-json-to-sqlite.ts` - 迁移脚本

### 3. Main 进程

- `src/main/runners/claudecode/runner.ts` - Claude Code runner
- `src/main/runners/codex/runner.ts` - Codex runner
- `src/main/orpcBridge.ts` - oRPC 桥接

### 4. Preload 层

- `src/preload/bridges/runners.ts` - Runner 桥接
- `src/preload/index.d.ts` - 类型声明

### 5. Renderer 进程

- `src/renderer/src/features/workspace/types.ts` - 前端类型
- `src/renderer/src/features/workspace/state/store.ts` - 状态管理
- `src/renderer/src/features/workspace/state/store.test.ts` - 测试
- `src/renderer/src/features/workspace/views/SessionsView.tsx` - 视图
- `src/renderer/src/features/workspace/views/WorkspaceLayout.tsx` - 布局
- `src/renderer/src/features/workspace/hooks/useAgentRunner.ts` - Hook
- `src/renderer/src/state/runnerLogs.ts` - 日志状态

## 执行步骤

1. [x] 更新共享类型定义（`src/shared/`）
2. [x] 更新数据库 schema 和服务（`src/main/db/`）
3. [x] 更新 Main 进程 runner 实现（`src/main/runners/`）
4. [x] 更新 Preload 桥接层（`src/preload/`）
5. [x] 更新 Renderer 类型和状态（`src/renderer/`）
6. [x] 验证编译通过，运行测试
7. [x] 更新本文档状态为 done

## 数据库迁移

由于数据库字段名变更，需要添加迁移：

```sql
-- Migration v2: Rename job_id to trace_id
ALTER TABLE messages RENAME COLUMN job_id TO trace_id;
```

## 注意事项

- 数据库迁移需要向后兼容（旧数据仍可读取）
- 一次性完成所有文件修改，避免中间状态
- 修改后运行 `pnpm typecheck` 和 `pnpm lint` 验证

