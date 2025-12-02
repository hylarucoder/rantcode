# Task 文档

本目录包含任务文档，用于驱动应用内的看板视图。

## 任务列表

| 文档 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| [drizzle-orm-research.md](./drizzle-orm-research.md) | done | P1 | Drizzle ORM 调研与引入计划 |
| [release-checklist.md](./release-checklist.md) | in-review | P1 | 发布前检查清单 |
| [implement-i18n.md](./implement-i18n.md) | done | P1 | 国际化（i18n）支持 |
| [implement-task-board.md](./implement-task-board.md) | done | P0 | 任务看板功能 |
| [session-persistence.md](./session-persistence.md) | done | P2 | Session 持久化到 SQLite |
| [implement-tts.md](./implement-tts.md) | backlog | P2 | TTS 语音提醒功能 |
| [implement-multi-role.md](./implement-multi-role.md) | backlog | P2 | 多角色协作系统 |
| [task-board-enhancements.md](./task-board-enhancements.md) | doing | P2 | 任务看板增强 |
| [session-enhancements.md](./session-enhancements.md) | doing | P2 | Session 增强功能 |
| [refactor-runner-agent.md](./refactor-runner-agent.md) | doing | P1 | Runner Agent 重构 |

## Frontmatter 格式

每个任务文件需包含以下 frontmatter：

```yaml
---
title: 任务标题
status: backlog | todo | doing | in-review | done | canceled
priority: P0 | P1 | P2
owner: 负责人（可选）
---
```

## 任务状态流转

```
backlog → todo → doing → in-review → done
                   ↓
               canceled
```

## 使用说明

1. 每个任务一个独立的 `.md` 文件
2. 在应用的看板视图中可以拖拽改变状态
3. 状态变更会自动更新文件的 frontmatter
