# Design 文档

本目录包含架构设计、RFC 和开发规范文档。

## 架构与设计

| 文档 | 说明 |
|------|------|
| [architecture.md](./architecture.md) | 整体架构概览（Main/Preload/Renderer 分层） |
| [data-model.md](./data-model.md) | 核心数据模型（Project/Session/Job/Task） |
| [agents-design.md](./agents-design.md) | Agent 抽象层设计与集成 |
| [routing.md](./routing.md) | React Router 路由设计 |
| [workspace-store.md](./workspace-store.md) | Workspace 状态管理重构 |
| [renderer-refactor.md](./renderer-refactor.md) | Renderer 组件重构方案 |
| [modules-appendix.md](./modules-appendix.md) | 模块补充说明（Settings/oRPC/日志等） |

## 开发规范

| 文档 | 说明 |
|------|------|
| [react-render-stability.md](./react-render-stability.md) | React 渲染稳定性与自激回路防护 |
| [type-safety.md](./type-safety.md) | TypeScript 类型安全（无 any 策略） |
| [test-strategy.md](./test-strategy.md) | 测试策略（Store/Hook/组件层） |

## 设计原则

1. **文档驱动**：先有设计文档，再有代码实现
2. **分层清晰**：Main（特权）→ Preload（桥接）→ Renderer（UI）
3. **类型安全**：oRPC 合约 + Zod Schema + 强类型推导
4. **可测试性**：纯逻辑 → Hook → 视图分层测试
