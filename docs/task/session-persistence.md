---
title: Session 持久化到 SQLite
status: done
priority: P2
---

# Session 持久化

## 目标

将会话数据从 localStorage 迁移到 SQLite，支持搜索和分页。

## 已完成

- [x] 在 main 进程添加 SQLite 数据库（Drizzle ORM + better-sqlite3）
- [x] 创建 Session 表结构（`src/main/db/schema.ts`）
- [x] 创建 Message 表结构（外键关联 Session，CASCADE 删除）
- [x] 实现 CRUD API（`src/main/db/services/sessionService.ts`）
- [x] 迁移前端数据访问层（oRPC 接口保持不变）
- [x] 数据迁移脚本（JSON → SQLite）

## 技术栈

- **ORM**: Drizzle ORM v0.44.7
- **SQLite 驱动**: better-sqlite3 v12.5.0
- **迁移工具**: drizzle-kit v0.31.7

## 相关文档

- [Drizzle ORM 调研](./drizzle-orm-research.md)

