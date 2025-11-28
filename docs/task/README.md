# Task 文档

本目录包含任务文档，用于驱动应用内的看板视图。

## 任务列表

| 文档 | 状态 | 优先级 |
|------|------|--------|
| [release-checklist.md](./release-checklist.md) | backlog | P1 |
| [session-persistence.md](./session-persistence.md) | backlog | P2 |
| [implement-task-board.md](./implement-task-board.md) | done | P0 |

## Frontmatter 格式

每个任务文件需包含以下 frontmatter：

```yaml
---
title: 任务标题
status: backlog | in-progress | review | done | blocked
priority: P0 | P1 | P2
owner: 负责人（可选）
---
```

## 任务状态流转

```
backlog → in-progress → review → done
              ↓
           blocked
```

## 使用说明

1. 每个任务一个独立的 `.md` 文件
2. 在应用的看板视图中可以拖拽改变状态
3. 状态变更会自动更新文件的 frontmatter
