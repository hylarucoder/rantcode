---
title: Drizzle ORM 调研与引入计划
status: review
priority: P1
---

# Drizzle ORM 调研与引入计划

## 背景

当前项目使用 localStorage + JSON 文件进行数据存储，计划引入 SQLite 进行持久化（见 `session-persistence.md`）。本调研旨在评估 Drizzle ORM 作为 SQLite 访问层的可行性。

## 调研目标

1. 评估 Drizzle ORM 在 Electron 应用中的适用性
2. 确定最佳的技术栈组合（Drizzle + SQLite 驱动）
3. 制定实施路线图

---

## 阶段一：基础调研 (Day 1)

### 1.1 Drizzle ORM 核心特性

- [x] 了解 Drizzle 的设计理念（SQL-like TypeScript API）
- [x] 调研 schema 定义方式和类型推导能力
- [x] 了解 Query Builder vs Select API 的使用场景
- [x] 调研 drizzle-kit 迁移工具

### 1.2 与其他 ORM 对比

| 维度 | Drizzle | Prisma | TypeORM |
|------|---------|--------|---------|
| 类型安全 | ⭐⭐⭐ 100% 类型推导 | ⭐⭐⭐ 生成类型 | ⭐⭐ 装饰器+手动 |
| Bundle 大小 | ⭐⭐⭐ ~50KB | ⭐ ~2MB (engine) | ⭐⭐ ~500KB |
| SQLite 支持 | ⭐⭐⭐ 原生支持 | ⭐⭐ 支持 | ⭐⭐ 支持 |
| Electron 兼容性 | ⭐⭐⭐ better-sqlite3 | ⭐ 需要 binary | ⭐⭐ 支持 |
| 学习曲线 | ⭐⭐⭐ SQL-like 直观 | ⭐⭐ 独特 API | ⭐ 复杂装饰器 |
| 性能 | ⭐⭐⭐ 接近原生 | ⭐⭐ 有开销 | ⭐⭐ 有开销 |

**结论**: Drizzle 在 Electron + SQLite 场景下明显优于其他选择：
- 轻量无 runtime engine
- 与 better-sqlite3 完美集成
- 类型安全且 API 直观

### 1.3 相关资源

- Drizzle 官方文档: https://orm.drizzle.team/
- Drizzle GitHub: https://github.com/drizzle-team/drizzle-orm
- better-sqlite3: https://github.com/WiseLibs/better-sqlite3

---

## 阶段二：Electron 集成方案调研 (Day 1-2)

### 2.1 SQLite 驱动选择

| 驱动 | 特点 | Electron 兼容性 | 备注 |
|------|------|-----------------|------|
| better-sqlite3 | 同步 API，高性能 | 需要 native rebuild | Drizzle 推荐 |
| sql.js | 纯 JS，WASM | 开箱即用 | 性能略低 |
| libsql | Turso 提供 | 待验证 | 支持同步/异步 |

- [x] 评估 better-sqlite3 在 Electron 中的 native 模块重编译方案
- [x] 验证 electron-rebuild 或 @electron/rebuild 工具链
- [x] 考虑 sql.js 作为备选方案（不需要，better-sqlite3 工作正常）

### 2.2 进程架构设计

```
┌──────────────────────────────────────────────────────────────┐
│                        Main Process                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │   Drizzle ORM + better-sqlite3                        │   │
│  │   ┌────────────────────────────────────────────────┐ │   │
│  │   │  db/                                            │ │   │
│  │   │  ├── schema.ts     # 表结构定义                 │ │   │
│  │   │  ├── client.ts     # drizzle client 初始化      │ │   │
│  │   │  ├── migrations/   # 迁移文件                   │ │   │
│  │   │  └── repository/   # 数据访问层                 │ │   │
│  │   └────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │ IPC / oRPC                       │
└──────────────────────────────┼───────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────┐
│                        Renderer Process                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │   React Query + oRPC Client                           │   │
│  │   - 通过 preload bridge 调用 main 的数据库 API       │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

- [x] 确认数据库操作必须在 main process 执行（better-sqlite3 不支持 renderer）
- [x] 设计 IPC/oRPC 接口暴露数据库操作
- [ ] 考虑批量操作和事务的 API 设计（后续实施）

### 2.3 数据库文件位置

- [x] 确定数据库文件存储路径: `app.getPath('userData')/rantcode.db`
- [x] 开发/生产环境隔离: 开发环境使用 `rantcode (Dev)` 目录

---

## 阶段三：Schema 设计 (Day 2)

### 3.1 现有实体迁移

根据 `docs/spec/core-entities.md`，需要迁移的实体：

```typescript
// 示例 schema 设计（待验证）
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  title: text('title').notNull(),
  agentSessions: text('agent_sessions'), // JSON 字符串
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  jobId: text('job_id'),
  status: text('status'), // 'running' | 'success' | 'error'
  logs: text('logs'), // JSON 字符串
  output: text('output'),
  errorMessage: text('error_message'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' })
})
```

- [x] 确认 schema 设计与现有类型定义的对应关系
- [x] 设计索引策略（project_id、session_id 已创建索引）
- [x] JSON 字段处理：使用 TEXT 存储 JSON 字符串（logs、runnerSessions）

### 3.2 迁移策略

- [x] 评估 drizzle-kit 的迁移能力
- [ ] 设计 localStorage → SQLite 的数据迁移方案（后续实施）
- [x] 使用 SQLite `user_version` pragma 管理版本

---

## 阶段四：技术验证 POC (Day 2-3)

### 4.1 最小可行示例

- [x] 在主分支直接验证（代码可随时回滚）
- [x] 安装依赖：`drizzle-orm@0.44.7`, `better-sqlite3@12.5.0`, `drizzle-kit@0.31.7`
- [x] 实现基本 CRUD 操作（session.ts repository）
- [x] 验证 TypeScript 类型推导效果

### 4.2 Electron 集成验证

- [x] 验证 native 模块编译流程（使用 `@electron/rebuild`）
- [ ] 测试打包后的应用是否正常运行（后续验证）
- [x] 验证开发环境运行正常

### 4.3 性能测试

| 操作 | 目标响应时间 | 实际测试结果 |
|------|--------------|--------------|
| 查询 Session 列表 | < 50ms | 待测试（集成后） |
| 读取 Session 及 Messages | < 100ms | 待测试（集成后） |
| 批量写入 Messages | < 200ms | 待测试（集成后） |

---

## 阶段五：实施计划 (Day 3-4)

### 5.1 依赖安装

```bash
pnpm add drizzle-orm better-sqlite3
pnpm add -D drizzle-kit @types/better-sqlite3 @electron/rebuild
```

### 5.2 目录结构规划

```
src/main/
├── db/
│   ├── client.ts           # drizzle client 初始化
│   ├── schema.ts           # 表结构定义
│   ├── migrate.ts          # 迁移执行逻辑
│   └── repositories/
│       ├── session.ts      # Session CRUD
│       └── message.ts      # Message CRUD
├── migrations/             # drizzle-kit 生成的迁移文件
└── ...
```

### 5.3 oRPC 接口设计

```typescript
// 建议的 API 设计
interface SessionRepository {
  list(workspaceId: string): Promise<Session[]>
  get(id: string): Promise<Session | null>
  create(session: NewSession): Promise<Session>
  update(id: string, data: Partial<Session>): Promise<Session>
  delete(id: string): Promise<void>
}

interface MessageRepository {
  listBySession(sessionId: string): Promise<Message[]>
  append(sessionId: string, message: NewMessage): Promise<Message>
  updateStatus(id: string, status: MessageStatus): Promise<void>
  appendLog(id: string, log: LogEntry): Promise<void>
}
```

### 5.4 分阶段实施

| 阶段 | 内容 | 估计工时 |
|------|------|----------|
| Phase 1 | 基础设施：DB 初始化 + Schema | 2h |
| Phase 2 | Repository 实现 + oRPC 暴露 | 4h |
| Phase 3 | Renderer 迁移（替换 localStorage） | 4h |
| Phase 4 | 数据迁移脚本 + 测试 | 2h |

---

## 风险与注意事项

### 已知风险

1. **Native 模块兼容性**: better-sqlite3 需要为目标 Electron 版本重编译
2. **打包体积**: native 模块会增加应用体积
3. **开发环境配置**: 可能需要额外的构建步骤

### 备选方案

如果 better-sqlite3 集成困难，可以考虑：

1. **sql.js**: 纯 WASM 实现，无需 native 编译，但性能略低
2. **expo-sqlite**: 如果后续考虑跨平台
3. **IndexedDB + Dexie**: 纯前端方案，但不支持 SQL

---

## 调研结论

### 可行性评估

- [x] **Drizzle ORM 是否适合本项目**: ✅ 完全适合
  - 类型安全的 SQL-like API
  - 轻量级（无额外 runtime）
  - 与 better-sqlite3 完美集成
  
- [x] **推荐的 SQLite 驱动**: ✅ `better-sqlite3`
  - 使用 `@electron/rebuild` 成功编译原生模块
  - 同步 API 性能优秀
  - WAL 模式支持并发读写
  
- [x] **预估实施工时**: ~10-12h（与原计划一致）

### POC 验证结果

| 验证项 | 状态 | 备注 |
|--------|------|------|
| 依赖安装 | ✅ | `drizzle-orm@0.44.7`, `better-sqlite3@12.5.0` |
| 原生模块编译 | ✅ | `@electron/rebuild` 工作正常 |
| 数据库初始化 | ✅ | 在 app ready 后初始化成功 |
| 表结构创建 | ✅ | sessions + messages 表 + 索引 |
| 开发环境运行 | ✅ | `pnpm dev` 正常启动 |

### 已创建的代码

```
src/main/db/
├── client.ts           # 数据库连接管理
├── schema.ts           # 表结构定义 (Drizzle schema)
└── repositories/
    └── session.ts      # Session CRUD 操作
```

### 最终决策

**✅ 采用 Drizzle ORM + better-sqlite3 方案**

下一步：
1. 将 session repository 集成到 oRPC
2. 迁移 renderer 端使用新的数据库 API
3. 实现 localStorage → SQLite 数据迁移脚本

---

## 参考资料

- [Drizzle ORM 官方文档](https://orm.drizzle.team/)
- [Drizzle + SQLite 教程](https://orm.drizzle.team/docs/get-started-sqlite)
- [Electron 中使用 native 模块](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)

