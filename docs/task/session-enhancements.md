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

- `session-persistence.md` - Session 持久化（可并行开发）

## 待办

### Message 时间戳

- [ ] 在消息列表中显示发送时间
- [ ] 支持相对时间（刚刚、5分钟前）和绝对时间切换
- [ ] 对于长会话，添加日期分隔线

### Message 操作

- [ ] 复制消息内容（纯文本/Markdown）
- [ ] 重发消息功能
- [ ] 编辑并重发
- [ ] 删除单条消息

### Session 管理

- [ ] Session 重命名
- [ ] Session 归档（不删除但隐藏）
- [ ] Session 导出（JSON/Markdown）
- [ ] Session 搜索和过滤
  - 按关键词搜索
  - 按时间范围过滤
  - 按 Agent 类型过滤

### Agent 可用性检测

- [ ] 在 UI 中显示各 Agent 的可用状态
- [ ] 不可用时显示原因和解决建议
- [ ] 支持一键检测所有 Agent
- [ ] 后台定期自动检测（可配置）

## 技术要点

### Message 扩展字段

```typescript
interface Message {
  // 现有字段...
  timestamp: Date
  editedAt?: Date
  status: 'sending' | 'sent' | 'failed'
}
```

### Agent 状态显示

```typescript
interface AgentStatus {
  id: string
  name: string
  available: boolean
  reason?: string
  lastChecked: Date
}
```

## 验收标准

- [ ] 消息显示时间戳
- [ ] 可以复制和重发消息
- [ ] Session 支持重命名和归档
- [ ] Session 支持搜索和过滤
- [ ] Agent 可用性状态在 UI 中可见

