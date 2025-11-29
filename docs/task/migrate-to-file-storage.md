---
title: 从 SQLite 迁移到纯文件存储
status: done
priority: P1
---

# 从 SQLite 迁移到纯文件存储

## 背景

当前使用 SQLite + Drizzle ORM 存储 Session 和 Message，存在以下问题：

1. **logs 字段过大**：CLI 输出可能非常大（几十 MB），全部存在 Message 的 JSON 字段里会导致内存压力和查询效率问题
2. **依赖复杂**：`better-sqlite3` 是 native 模块，需要编译，增加打包复杂度
3. **调试不便**：需要 DB 工具才能查看数据
4. **过度设计**：本地单用户 Electron 应用不需要 SQL 的查询能力

## 目标方案

### 文件结构

```
~/.rantcode/projects/{encodedRepoPath}/
├── sessions.json                    # Session 列表索引
├── sessions/
│   └── {sessionId}/
│       ├── meta.json                # Session 元数据
│       ├── messages.json            # Message 列表（不含 logs）
│       └── logs/
│           └── {traceId}.jsonl      # 每次执行的日志流
```

其中 `encodedRepoPath` 是项目路径的编码形式：
- `/Users/lucasay/Workspace/Projects/my-project` → `Users-lucasay-Workspace-Projects-my-project`
- 规则：去掉开头的 `/`，把 `/` 替换成 `-`

### 数据结构

#### sessions.json（索引）

```ts
interface SessionIndex {
  version: 1
  sessions: SessionMeta[]
}

interface SessionMeta {
  id: string
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}
```

#### {sessionId}/meta.json

```ts
interface SessionDetail {
  id: string
  title: string
  runnerContexts?: RunnerContextMap
  createdAt: string
  updatedAt: string
}
```

#### {sessionId}/messages.json

```ts
interface MessageStore {
  version: 1
  messages: MessageRecord[]
}

interface MessageRecord {
  id: string
  role: 'user' | 'assistant'
  content: string
  traceId?: string
  status?: 'running' | 'success' | 'error'
  output?: string
  errorMessage?: string
  startedAt?: number
  runner?: string
  // 注意：logs 不在这里，通过 traceId 关联到独立文件
  logMeta?: {
    count: number
    sizeBytes: number
  }
}
```

#### {sessionId}/logs/{traceId}.jsonl

每行一个 LogEntry，追加写入：

```jsonl
{"id":"1","stream":"stdout","text":"Starting...","timestamp":1700000000000}
{"id":"2","stream":"stdout","text":"Done.","timestamp":1700000001000}
```

## 执行步骤

### Phase 1: 新存储层实现

- [x] 1.1 创建 `src/main/storage/` 目录结构
- [x] 1.2 实现 `SessionStorage` 类（CRUD 操作）
- [x] 1.3 实现 `LogStorage` 类（日志流式读写）
- [x] 1.4 实现路径管理工具函数

### Phase 2: 服务层适配

- [x] 2.1 创建 `FileSessionService` 替代 `DbSessionService`
- [x] 2.2 更新 oRPC 路由使用新服务
- [x] 2.3 添加日志按需加载 API：`getMessageLogs(messageId, { offset, limit })`

### Phase 3: 前端适配

- [x] 3.1 Message 类型添加 `logMeta`（保留 `logs` 用于实时流式日志）
- [x] 3.2 执行详情面板按需加载日志
- [ ] 3.3 日志列表支持虚拟滚动（大日志场景）— 后续优化

### Phase 4: 迁移与清理

- [x] 4.1 实现 SQLite → 文件迁移脚本
- [x] 4.2 移除 SQLite 相关代码和依赖（保留 better-sqlite3 用于迁移）
- [ ] 4.3 更新文档 — 后续

**注意**：`better-sqlite3` 依赖暂时保留，因为迁移脚本需要它来读取旧的 SQLite 数据库。在确认所有用户都完成迁移后（比如几个版本之后），可以移除。

## API 变更

### 新增

```ts
// 按需加载消息日志
sessions.getMessageLogs: {
  input: { projectId, sessionId, messageId, offset?, limit? }
  output: { logs: LogEntry[], total: number, hasMore: boolean }
}

// 追加日志（内部使用，Runner 执行时调用）
sessions.appendLog: {
  input: { projectId, traceId, entry: LogEntry }
  output: { ok: boolean }
}
```

### 变更

```ts
// Message schema 变更
messageSchema = z.object({
  // ... 其他字段不变
  // logs: z.array(logEntrySchema).optional()  // 移除
  logMeta: z.object({
    count: z.number(),
    sizeBytes: z.number()
  }).optional()  // 新增
})
```

## 风险与回退

- **数据迁移**：需要处理已有 SQLite 数据
- **回退方案**：保留迁移脚本的反向逻辑，必要时可回退到 SQLite

## 相关文档

- [核心实体规范](../spec/core-entities.md)
- [数据模型设计](../design/data-model.md)

