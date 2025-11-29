---
title: Session 增强功能
status: in-progress
priority: P2
owner: AI
---

# Session 增强功能

## 目标

增强 Session 和 Message 的用户体验，添加实用的辅助功能。

## 前置依赖

- `session-persistence.md` - Session 持久化（✅ 已完成，SQLite 存储已实现）

## 待办

### Message 时间戳

- [x] 在消息列表中显示发送时间
- [x] 支持相对时间（刚刚、5分钟前）和绝对时间切换
- [ ] 对于长会话，添加日期分隔线

**已实现：**

- `MessageTimestamp` 组件（`features/workspace/components/MessageTimestamp.tsx`）
- 点击可切换相对/绝对时间显示模式
- 相对时间每分钟自动更新
- `humanizeRelativeTime` / `formatAbsoluteTime` 工具函数（`@shared/utils/humanize.ts`）

### Message 操作

- [x] 复制消息内容（纯文本/Markdown）
- [ ] 重发消息功能
- [ ] 编辑并重发
- [ ] 删除单条消息

**已实现：**

- `UserMessageBubble` / `AssistantMessageBubble` 组件中实现复制按钮
- hover 时显示复制按钮，点击后显示成功提示

### Session 管理

- [x] Session 重命名（后端 + UI）
- [x] Session 归档（不删除但隐藏）
- [x] Session 删除
- [ ] Session 导出（JSON/Markdown）
- [ ] Session 搜索和过滤
  - 按关键词搜索
  - 按时间范围过滤
  - 按 Agent 类型过滤

**已实现：**

- `updateSession` API 支持修改 title 和 archived 字段
- `deleteSession` API 支持删除会话
- `listSessions` API 支持 `includeArchived` 参数过滤已归档会话
- `SessionItem` 组件支持右键菜单（重命名、归档、删除）
- 内联编辑重命名功能（Enter 保存，Escape 取消）
- 显示/隐藏已归档会话切换按钮

### Agent 可用性检测

- [x] Runner 可用性检测逻辑
- [ ] 在 UI 中显示各 Agent 的可用状态
- [ ] 不可用时显示原因和解决建议
- [ ] 支持一键检测所有 Agent
- [ ] 后台定期自动检测（可配置）

**已实现（后端）：**

- `detect` / `detectAll` 函数检测 Runner CLI（`src/main/runners/detect.ts`）
- `runners.info` API 返回各 Runner 的路径和版本信息
- `useAgentsInfoQuery` hook 获取 Runner 信息

## 技术要点

### Message 扩展字段

当前 Message 类型定义（`features/workspace/types.ts`）：

```typescript
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 消息创建时间戳（ms） */
  createdAt?: number
  /** 执行追踪标识（用于关联 RunnerEvent） */
  traceId?: string
  status?: 'running' | 'success' | 'error'
  logs?: LogEntry[]
  logMeta?: LogMeta
  output?: string
  errorMessage?: string
  contextId?: string
  startedAt?: number
  runner?: string
}
```

### 时间戳组件

```typescript
// MessageTimestamp 组件 props
interface MessageTimestampProps {
  timestamp?: number
  mode?: 'relative' | 'absolute'
  onModeChange?: (mode: TimeDisplayMode) => void
  className?: string
}
```

### Agent 状态接口

当前 `runners.info` API 返回的数据结构：

```typescript
interface RunnersInfo {
  codex: { executablePath?: string; version?: string }
  claudeCode: { executablePath?: string; version?: string }
  kimiCli?: { executablePath?: string; version?: string }
}
```

建议扩展为：

```typescript
interface AgentStatus {
  id: string
  name: string
  available: boolean
  executablePath?: string
  version?: string
  reason?: string        // 不可用时的原因
  lastChecked: Date
}
```

### Session 导出格式

**JSON 格式：**

```json
{
  "id": "session-id",
  "title": "会话标题",
  "createdAt": "2024-11-29T10:00:00Z",
  "updatedAt": "2024-11-29T12:30:00Z",
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "content": "...",
      "createdAt": 1732875600000
    }
  ]
}
```

**Markdown 格式：**

```markdown
# 会话标题

创建时间: 2024-11-29 10:00
最后更新: 2024-11-29 12:30

---

## User (10:00)

用户消息内容

## Assistant (10:01)

助手回复内容
```

## 实现计划

### Phase 1: Message 增强（当前进度）

1. ~~时间戳显示~~（✅ 已完成）
2. ~~复制消息~~（✅ 已完成）
3. 日期分隔线

### Phase 2: Session 管理 UI（✅ 已完成）

1. ~~Session 重命名 UI~~（✅ 内联编辑实现）
2. ~~Session 归档功能~~（✅ 支持归档/取消归档）
3. ~~Session 删除功能~~（✅ 下拉菜单中删除选项）
4. ~~显示/隐藏已归档切换~~（✅ 眼睛图标切换）

### Phase 3: 高级功能

1. Session 导出（JSON/Markdown）
2. Session 搜索和过滤

### Phase 4: Agent 状态

1. Agent 状态 UI 显示
2. 不可用提示和解决建议
3. 后台定期检测

## 文件位置

| 功能 | 文件路径 |
|------|----------|
| Message 类型 | `src/renderer/src/features/workspace/types.ts` |
| Session 类型 | `src/renderer/src/features/workspace/types.ts` |
| 时间戳组件 | `src/renderer/src/features/workspace/components/MessageTimestamp.tsx` |
| 时间格式化工具 | `src/shared/utils/humanize.ts` |
| 用户消息组件 | `src/renderer/src/features/workspace/components/UserMessageBubble.tsx` |
| 助手消息组件 | `src/renderer/src/features/workspace/components/AssistantMessageBubble.tsx` |
| 会话列表组件 | `src/renderer/src/features/workspace/components/SessionsAssistantsPanel.tsx` |
| 会话状态管理 | `src/renderer/src/features/workspace/state/store.ts` |
| Session 数据库 schema | `src/main/db/schema.ts` |
| Session 存储 | `src/main/db/repositories/session.ts` |
| Session 服务 | `src/main/db/services/sessionService.ts` |
| API Schemas | `src/shared/orpc/schemas.ts` |
| Runner 检测 | `src/main/runners/detect.ts` |
| Runner 信息 hook | `src/renderer/src/features/settings/api/agentsHooks.ts` |

## 验收标准

- [x] 消息显示时间戳（相对/绝对切换）
- [x] 可以复制消息内容
- [ ] 长会话显示日期分隔线
- [ ] 可以重发和编辑重发消息
- [x] Session 支持重命名（UI + 后端）
- [x] Session 支持归档（UI + 后端）
- [ ] Session 支持导出
- [ ] Session 支持搜索和过滤
- [ ] Agent 可用性状态在 UI 中可见

## 相关文档

- [核心实体规范](../spec/core-entities.md) - Session / Message 数据结构定义
- [数据模型设计](../design/data-model.md) - 整体数据模型架构
- [Session 持久化](./session-persistence.md) - SQLite 存储实现
