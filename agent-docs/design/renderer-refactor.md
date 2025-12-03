# Renderer 重构与组件设计方案

本方案目标：梳理 renderer 层的职责边界，统一数据访问与状态管理，细化组件粒度，提升可维护性与可扩展性（Spec/AgentTrace/TTS/Settings 等）。

## 设计目标

- 清晰分层：页面容器 / 业务模块（features）/ 共享模块（shared）。
- 统一数据访问：全部通过 oRPC + TanStack Query 的 utils（queryOptions/mutationOptions/key）。
- 可复用的 UI 与 Hooks：抽取滚动到底、主题、对话解析等通用能力。
- 事件桥封装：对 `window.api.agents`、`window.api.docs` 等订阅统一封装为 hooks。
- 渐进迁移：先抽基础 hook 与目录骨架，再拆大型页面组件。

## 目录结构（建议）

```
src/renderer/src/
  app/
    AppShell.tsx                 # 顶层外壳（标题栏、主题、项目选择）
    providers/
      QueryProvider.tsx          # TanStack Query Provider 封装
      OrpcProvider.tsx           # （可选）oRPC 初始化/错误边界
  features/
    projects/
      api/hooks.ts               # useProjectsQuery/useAddProject/useRemoveProject
      store/context.tsx          # ProjectsProvider/useProjects
      views/ProjectsLanding.tsx  # 项目落地页
      components/ProjectPicker.tsx
    workspace/
      views/WorkspacePage.tsx    # 容器（原 ProjectDetailShell 拆分）
      components/
        SessionList.tsx
        MessageList.tsx
        Composer.tsx
        RightPanel.tsx           # 右侧 Preview/AgentTrace 切换容器
      hooks/
        useWorkspaceContext.tsx
        useCodexRunner.ts        # run/subscribe/状态聚合
    spec/
      api/fs.ts                  # useFsTree/useFsRead（封装 orpc.fs）
      views/Explorer.tsx
      components/FileTree.tsx
      components/Preview.tsx
    logs/
      lib/agentTrace.ts          # 解析函数（可测）
      components/AgentTraceTimeline.tsx
      components/AgentTracePreview.tsx
      components/ExecAgentTrace.tsx
    settings/
      views/SettingsPage.tsx
      sections/ProvidersSettings.tsx
      sections/TTSSettings.tsx   # 新增（v2）
  shared/
    ui/*                         # 通用 UI
    hooks/
      useAutoScroll.ts           # 滚动到底/吸底逻辑
      useThemeMode.ts
    lib/
      orpcQuery.ts
      markdown.ts
      markdownRenderer.ts
      utils.ts
    types/*
```

## 数据访问与状态

- oRPC 统一：
  - 查询：`useQuery(orpc.xxx.yyy.queryOptions())`
  - 修改：`useMutation(orpc.xxx.yyy.mutationOptions())`
  - 失效：`queryClient.invalidateQueries({ queryKey: orpc.xxx.yyy.key() })`
- hooks 化：每个 feature 提供自己 `api/hooks.ts`，页面只使用业务语义 hooks。
- 状态分工：
  - 服务端数据 → TanStack Query
  - UI/会话/短期本地状态 → Context/Zustand

## 事件桥封装

- 将 `window.api.agents`/`window.api.docs` 订阅统一封装成 hooks：
  - `useCodexRunner(workspaceId)`：提供 `run()`、`status`、`messages`、`logs`、`onExit` 等。
  - `useDocsWatcher(workspaceId)`：驱动 spec Explorer 的增量刷新。

## 组件拆分原则

- 页面容器负责装配布局与注入 hooks，不直接管理复杂状态与副作用。
- 纯展示组件只接收数据与回调，如 `MessageList`、`SessionList`。
- 公共逻辑抽 hook：如自动滚动、粘底、Markdown 渲染等。

## 渐进迁移计划

1. 基础设施与无破坏抽取（v1）

- 新增 `shared/hooks/useAutoScroll.ts`，替换现有重复滚动逻辑（消息列表/执行日志）。
- 为 projects/spec 提供 `api/hooks.ts` 封装 orpc 调用（对页面透明）。

2. Workspace 拆分（v1→v2）

- 将 `ProjectDetailShell` 拆为 `WorkspacePage + SessionList/MessageList/Composer/RightPanel`。
- 抽 `useCodexRunner`：统一 run/subscribe/状态聚合。

3. AgentTrace 收敛（v2）

- 将 Agent Trace 组件统一放入 `features/logs`，统一 UI 与导出接口。

4. Settings 扩展（v2）

- 增加 `TTSSettings`：配置 TTS 引擎/音色/速率与策略；与 `agent-docs/spec/tts.md` 对齐。

5. 清理与对齐（v3）

- 删除旧路径引用，统一 import；必要时加小型单测（parser/hook）。

## 代码风格与命名

- 组件：PascalCase；hook：useCamelCase；文件名与导出组件一致。
- 引入：`@/features/...`、`@/shared/...`、`@/app/...`。
- UI 与逻辑分层：容器 vs 展示，hooks 承担副作用与状态聚合。

---

下步落地：v1 先引入 `useAutoScroll` 并替换关键滚动逻辑；随后开始拆分 Workspace。
