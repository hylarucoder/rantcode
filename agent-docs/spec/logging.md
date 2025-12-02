# 日志规范（Logging）

本规范用于统一 Rantcode 在 **main / preload / renderer** 三层的日志行为，方便排查问题、分析用户反馈，并为后续遥测/聚合做准备。

## 目标与原则

- **可追踪**：一次用户操作可以通过 `traceId / sessionId / projectId` 串起完整链路。
- **可过滤**：通过 `module` 和 `level` 快速筛选相关日志。
- **可阅读**：消息简洁、结构化，避免噪音。
- **安全**：避免在日志中泄露源码、密钥等敏感信息。

## 日志基础模型

统一使用以下概念（逻辑模型，与具体实现解耦）：

- `level`: `'error' | 'warn' | 'info' | 'debug'`
- `module`: 字符串，表示日志来源模块，例如：
  - `app.lifecycle`
  - `db.client`
  - `sessions.db`
  - `workspace.sessions`
  - `runner.claude`
- `message`: 简短的文本，描述发生了什么，建议英文 + 可读 key，例如：
  - `database-initialized`
  - `sessions.list completed`
  - `session-created`
- `context`: 结构化对象，包含业务主键和补充信息：
  - 必要字段：`projectId` / `sessionId` / `traceId` / `runner` 等
  - 避免塞入大块文本（源码 / diff / 大 JSON）
- `stack`: 在异常时可选的堆栈信息。

### 模块级 Logger 接口

各层都建议使用统一的模块 logger 接口：

- `error(message: string, err?: unknown, context?: Record<string, unknown>)`
- `warn(message: string, context?: Record<string, unknown>)`
- `info(message: string, context?: Record<string, unknown>)`
- `debug(message: string, context?: Record<string, unknown>)`

main 侧通过 `loggerService.child(moduleName)` 获取，renderer 侧通过 `getLogger(moduleName)` 获取。

## 环境变量约定

> 现有环境变量较多，后续可以逐步收敛为以下几类（兼容旧变量，但优先使用这些）。

- `RANTCODE_LOG_LEVEL`
  - 作用：主进程 logger 的全局级别（winston level）
  - 建议：`error | warn | info | debug`，默认 `info`
- `RANTCODE_LOG_MODULES`
  - 作用：renderer 端模块过滤，glob 支持（逗号分隔），复用 `DEBUG` 风格
  - 例：`workspace.*`, `db.*`, `runner.*`
  - 默认：`*`
- `RANTCODE_LOG_TO_MAIN_LEVEL`
  - 作用：renderer → main 转发的最低级别
  - 建议：默认 `error`，开发排查时可调到 `info` 或 `debug`

现有变量（如 `RANTCODE_FILE_LOG_LEVEL` / `RANTCODE_CONSOLE_LOG_LEVEL`）可以视作细粒度 override，原则上不再新增同类型变量。

## 各层使用方式

### Main 进程

- 入口：`src/main/logging.ts` + `src/main/services/loggerService.ts`
- 获取模块 logger：

```ts
import { loggerService } from './services/loggerService'

const log = loggerService.child('db.client')

log.info('database-initializing', { dbPath })
log.info('database-initialized')
log.error('migration-failed', { error: err })
```

规范：

- 默认都带 `module` 字段（由 `child` 内部统一注入）。
- 重要操作（启动、关闭、迁移）使用 `info`。
- 异常情况使用 `warn` 或 `error`，并在 `context` 中包含业务主键。

### Preload 层

- 入口：`src/preload/bridges/logger.ts`
- 职责：
  - 格式化 DevTools 输出（带颜色/时间戳）
  - 按阈值把日志通过 IPC 转发给 main
- 一般不直接给业务模块用，而是为 renderer 通过 `window.api.logger` 提供桥接。

### Renderer 层

- 入口：
  - `src/renderer/src/lib/logger.ts`
  - `src/renderer/src/services/loggerService.ts`
- 获取模块 logger：

```ts
import { getLogger } from '@/lib/logger'

const log = getLogger('workspace.sessions')

log.info('sessions-loaded', { projectId, count: sessions.length })
log.warn('sessions-api-unavailable')
log.error('sessions-sync-failed', err, { projectId, sessionId })
```

规范：

- 尽量避免直接使用 `console.log` / `console.error`，改用模块 logger。
- 开发时的「一次性调试输出」可以用 `debug`，并通过 `RANTCODE_LOG_MODULES` 控制是否启用。

## Level 使用约定

- `error`
  - 影响功能、需要重点关注的问题
  - 例：数据库初始化失败、runner 调用失败导致用户操作中断
- `warn`
  - 有异常但能 fallback 的情况
  - 例：某个 oRPC namespace 不可用、某些配置缺失改用默认
- `info`
  - 正常但重要的状态变化
  - 例：应用启动、窗口创建、项目/会话列表加载完成
- `debug`
  - 仅用于开发调试的详细信息
  - 例：请求参数、性能耗时细节、批量事件内容

## 业务字段与 traceId

为了便于从用户反馈回溯问题，推荐在 `context` 中尽量包含这些字段：

- `projectId`
- `sessionId`
- `messageId`
- `traceId`
- `runner`

推荐模式：

- `notifyBridge` / `orpcBridge` / workspace store 等链路中，**生成或传递 `traceId`**。
- 与 workspace 相关的日志模块名统一以 `workspace.*` 开头，例如：
  - `workspace.sessions`
  - `workspace.kanban`
  - `workspace.git`

## 隐私与脱敏

- 避免直接记录：
  - 源码全文
  - 大块 diff
  - Token / 密钥 / Cookie / Access Token
- 如确需记录内容：
  - 建议只存长度、hash、文件路径等摘要信息，例如：
    - `contentLength`
    - `sha256`
    - `filePath`

后续可以在 main 进程的 winston `format` 管道中增加简单的脱敏逻辑（识别常见 token 模式并替换为 `***`）。

## 示例：数据库客户端日志

文件：`src/main/db/client.ts`（推荐模式）

- 模块名：`db.client`
- 关键日志：
  - `database-initializing`（含 `dbPath`）
  - `database-initialized`
  - `migrations-running`（含 `migrationsFolder`）
  - `migrations-skipped`
  - `migrations-completed`
  - `migrations-failed`

## 示例：workspace sessions 日志

文件：`src/renderer/src/features/workspace/state/store.ts`

- 模块名：`workspace.sessions`
- 示例日志：
  - `sessions-api-unavailable`（`warn`）
  - `sessions-loaded`（`info`，含 `projectId`, `count`）
  - `sessions-sync-failed`（`error`，含 `projectId`, `sessionId`）
  - `messages-sync-failed`（`error`，含 `projectId`, `sessionId`, `messageId`）

## 迁移策略

1. **新代码一律使用模块 logger**，禁止直接加新的 `console.log`。
2. 逐步从核心路径开始替换：
   - main：数据库、orpcBridge、runners
   - renderer：workspace store、GitPanel、KanbanPanel
3. 当迁移覆盖到主要模块后：
   - 在 ESLint 中开启 `no-console`（可暂时允许 `console.error` / `console.warn`）。


