---
title: Session 持久化到 SQLite
status: backlog
priority: P2
---

# Session 持久化

## 目标

将会话数据从 localStorage 迁移到 SQLite，支持搜索和分页。

## 待办

- [ ] 在 main 进程添加 SQLite 数据库
- [ ] 创建 Session 表结构
- [ ] 创建 Message 表结构（外键关联 Session）
- [ ] 实现 CRUD API
- [ ] 迁移前端数据访问层

