---
title: 优化 Notify 通道与 Workspace UI 性能
status: done
priority: P2
---

## 背景

当前项目在基础架构上已经有一套比较完善的 oRPC + preload + renderer 分层：

- `src/main/notifyBridge.ts` 负责将主进程的消息通过 `MessagePortMain` 推送到 renderer。
- `src/preload/orpc.ts` 暴露了 `subscribeNotify`，但 topic / payload 目前是弱类型字符串约定。
- Workspace 相关 UI（如 `GitPanel.tsx`、`KanbanPanel.tsx`）体积较大，内聚了数据拉取、复杂解析逻辑和渲染，后续维护和性能优化成本较高。

在日常使用中，这带来了一些问题：

- Notify 通道缺乏统一的语义约束和类型安全，topic 易散乱扩散、调用方依赖约定记忆。
- Git Diff 渲染、看板 frontmatter 解析等逻辑与 UI 混杂在大组件中，重复计算、难以复用或独立测试。
- 类型来源存在一定分裂，部分地方从 `schemas.ts` 推导，部分地方直接使用独立的 `types`，演进时容易不一致。

本任务希望在不影响现有功能的前提下，系统性梳理并优化 Notify 通道与 Workspace UI 性能。

## 目标

- 为 Notify 通道引入基础的 **topic / payload 类型约束** 和统一语义，避免“魔法字符串”和结构漂移。
- 将 Git 面板、看板面板中的 **重计算逻辑与 UI 解耦**，在提升可读性的同时降低重复计算、减少不必要的重渲染。
- 在 RPC 相关类型上进一步向 `zod schema → inferred types` 收敛，减少三端（main / preload / renderer）间类型不一致的风险。

## 拆解任务

### 1. Notify 通道类型与语义增强（高优先级）✅ 已完成

- [x] 在 shared 层新增一个轻量的 Notify 定义（`src/shared/notify.ts`）：
  - [x] 定义 `NotifyTopic` 字面量联合类型（`'docs' | 'codex' | 'runner.event'`）
  - [x] 定义 `NotifyPayloadMap` 接口，将 topic 映射到对应 payload 结构
  - [x] 定义 `SubscribeNotifyFn` 类型和 `NotifyMessage` 接口
- [x] 调整 `src/preload/orpc.ts` 中的 `subscribeNotify` 签名：
  - [x] 改为基于 `NotifyTopic` / `NotifyPayloadMap` 的泛型函数
  - [x] 调用方（runners/docs bridge）获得正确的 payload 类型推导
- [x] 更新 `src/main/notifyBridge.ts`：
  - [x] 使用类型安全的 `postNotify<T extends NotifyTopic>` 函数
  - [x] 新增 `notifyRunnerEvent` 导出函数
- [x] 更新 bridges（`runners.ts`, `docs.ts`）使用新的 `SubscribeNotifyFn` 类型

### 1.5 docsWatcher 性能优化 ✅ 已完成

- [x] 文件类型过滤：只监听文档类型（`.md`, `.mdx`, `.json`, `.yaml`, `.yml`, `.txt`）
- [x] 大文件保护：超过 512KB 的文件不内联 content，避免 I/O 压力
- [x] Debounce 机制：同一文件 300ms 内多次变更只发一次事件
- [x] Watcher TTL：无订阅后延迟 30s 关闭，避免频繁创建/销毁
- [x] 降低监听深度：从 `depth: 12` 调整为 `depth: 6`
- [x] 添加结构化日志：watcher 创建/就绪/关闭/错误等关键节点

### 2. GitPanel 解析与渲染性能优化（中优先级）✅ 已完成

- [x] 拆分 `GitPanel.tsx`（从 745 行缩减到 245 行）：
  - [x] 提取 diff 解析逻辑到 `utils/diffParser.ts`（186 行）
  - [x] 拆分 `git/DiffView.tsx`（350 行）- Unified / Split 视图
  - [x] 拆分 `git/GitFileList.tsx`（88 行）- 文件列表组件
  - [x] 拆分 `git/GitStatusIcon.tsx`（69 行）- 状态图标
- [x] 为 diff 解析结果增加缓存：
  - [x] 使用内容 hash 作为 key 的 in-memory 缓存（`parseHunkLinesWithCache` / `buildSplitLinesWithCache`）
  - [x] 最大缓存 50 条，LRU 淘汰
  - [x] 子组件使用 `memo` + `useMemo` 避免重复渲染

### 3. KanbanPanel 任务与 frontmatter 处理优化（中优先级）✅ 已完成

- [x] 拆分 `KanbanPanel.tsx`（从 1160 行缩减到 517 行）：
  - [x] 提取 frontmatter 解析逻辑到 `utils/frontmatterParser.ts`（110 行）
  - [x] 拆分 `kanban/TaskCard.tsx`（215 行）- 可排序任务卡片
  - [x] 拆分 `kanban/NewTaskDialog.tsx`（186 行）- 新建任务对话框
  - [x] 拆分 `kanban/KanbanColumn.tsx`（113 行）- 看板列组件
  - [x] 拆分 `kanban/types.ts`（63 行）- 类型和配置

### 4. RPC 相关类型与 schema 收敛（低优先级）✅ 已完成

- [x] 清点 Workspace 相关代码中引用 RPC 数据结构的地方（Git、文件树、会话等），区分：
  - [x] 通过 `z.infer<typeof xxxSchema>` 推导的类型。
  - [x] 直接定义在 `@shared/types/webui` 或 renderer 内部的类型。
- [x] 将与 RPC 输入/输出直接相关的类型统一迁移为从 `src/shared/orpc/schemas.ts` 推导：
  - [x] 在 `schemas.ts` 中导出所有推导类型（FsTreeNode, FsFile, ProjectInfo, GitFileStatus, GitDiff 等 18+ 类型）
  - [x] 更新 `renderer/src/types/index.ts` 从 schemas 重新导出 RPC 类型
  - [x] 清理 `shared/types/webui.ts` 删除重复类型和未使用的 ServicePrototype
  - [x] 更新 `main/rpc.ts` 使用 schemas 导出的类型
  - [x] main / preload / renderer 在编译期共享同一套结构定义。
- [x] 非 RPC（纯 UI）层的类型保留在适当位置：
  - [x] `shared/types/webui.ts` 保留 Notify 通道类型（DocsWatcherEvent, RunnerEvent, RunnerRunOptions）
  - [x] `renderer/src/types/index.ts` 保留纯 UI 类型（SpecDocMeta, DiffChangeItem, TaskItem 等）

## 验收标准

- Notify 通道：
  - 所有使用 Notify 的地方均通过 `NotifyTopic` / `NotifyPayloadMap` 进行类型约束。
  - 新增或修改 topic / payload 时，缺少实现或使用错误能通过 TypeScript 报错暴露。
- GitPanel / KanbanPanel：
  - 主组件体积明显缩减（粗略目标：每个主文件控制在 ~300 行以内），核心逻辑被拆分到可复用的 util / hook / 子组件中。
  - 在包含较大 diff 或较多任务文件的项目中，交互（切换文件 / 拖拽任务）无明显 UI 卡顿。
- 类型收敛：✅
  - RPC 相关类型的主要来源是 `schemas.ts` + `z.infer`，`@shared/types/webui` 中不再出现与 RPC 输入/输出重复定义的结构。
  - `pnpm typecheck` 通过，无新增 TS 报错。


