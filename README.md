# Rantcode - 咆哮编辑器

一款本地 Electron 桌面应用，用于管理 AI 代码助手（如 Claude Code、Codex）的工作流。

> 「文档驱动开发」+ codex / claude code — 写代码，可能只需要文档 + 咆哮

## 功能特性

- **多 Runner 支持**：集成 Codex、Claude Code（官方/GLM/Kimi/MiniMax）等多种 AI 执行器
- **文档驱动开发**：以 `agent-docs/` 目录为核心，通过文档驱动代码变更
- **会话管理**：支持多会话并存，每个会话可切换不同 Runner 并保持独立上下文
- **实时预览**：Markdown 渲染 + 代码高亮（Shiki）
- **任务看板**：从 `agent-docs/task/` 文档中提取任务，形成可视化看板
- **Git 集成**：查看仓库状态、文件 diff，支持 unified/split 视图
- **国际化**：支持中文（zh-CN）和英文（en-US）界面

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

### 构建应用

```bash
pnpm build
```

### 运行构建后的应用

```bash
pnpm start
```

## 项目结构

```
src/
├── main/           # Electron 主进程（窗口管理、数据库、RPC）
├── preload/        # 预加载脚本（安全 API 桥接）
├── renderer/       # React 前端（UI 组件、状态管理）
└── shared/         # 共享类型和工具

agent-docs/         # 文档驱动开发的文档目录
├── overview/       # 项目总览、概念介绍
├── design/         # 架构设计、RFC
├── spec/           # 接口规范、模块边界
└── task/           # 任务文档（驱动看板视图）
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发模式（HMR） |
| `pnpm build` | 类型检查 + 生产构建 |
| `pnpm start` | 运行构建后的应用 |
| `pnpm lint` | 运行 ESLint |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | 运行测试（Vitest） |
| `pnpm db:generate` | 生成数据库迁移文件 |
| `pnpm db:migrate` | 执行数据库迁移 |

## 技术栈

- **框架**：Electron + React 19 + TypeScript
- **构建**：electron-vite + Vite 7
- **状态管理**：Zustand + React Query (TanStack Query)
- **RPC**：oRPC（类型安全的 IPC 通信）
- **数据库**：SQLite (libsql) + Drizzle ORM
- **样式**：Tailwind CSS 4
- **测试**：Vitest

## 许可证

MIT

