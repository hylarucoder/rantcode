# Rantcode 概念与信息结构概览

> 这份文档是给"如何用 rantcode 管理/驱动代码助手（如 Codex、Claude Code 等）"做一个统一的心智模型，方便之后在设计和实现上对齐语义。

## 1. 产品定位

- 本地 Electron 应用，用来**围绕一个代码仓库管理 AI 开发工作流**。
- 核心特点：
  - **文档驱动开发（Doc‑Driven Development）**：
    - 把 `docs/` 视为事实来源：overview/design/spec/task。
    - 任何任务、需求、设计变更优先落在文档上，再驱动代码改动。
  - **多模型代码助手中台**：
    - 能接 OpenAI / Anthropic / 本地模型等不同 Provider。
    - 上层工作流（会话、任务、Diff）尽量与具体模型解耦。

简单理解：这是一个“给 Codex / Claude Code 等代码助手用的工作台”，而不是一个单一模型的 UI。

## 2. 主体对象（Domain Objects）

### Project / 项目

- 映射到本地一个代码仓库：
  - 字段：`id`, `name`, `repoPath`。
  - 在首页（Projects 列表）里管理。
- 打开一个 Project 后，进入该项目的 Workspace 视图。

### Workspace / 工作区

- 绑定一个 Project，是“这个仓库 + 它的文档 + 它的会话”的容器。
- 当前 Workspace 内包含：
  - 会话列表（Sessions）
  - 文件树 / 文档树（Files / Docs）
  - 文件预览（Preview）
  - 文档 Explorer（Spec Explorer）
  - Diff 视图
  - Work（任务盘）

可以把 Workspace 当成“某个仓库的一整套 AI 助手工作环境”。

### Session / 会话

- 针对当前 Project 的一条对话线程，未来会接入实际的 LLM：
  - 角色：`user` / `assistant`。
  - 形式上类似 IDE 里的“对话面板”，但上下文会绑定到当前项目。
- 多 Session 并存：
  - 比如“Feature A 的讨论”、“Bug B 的排查”、“重构计划”等。

### Docs / 文档

- 在仓库中的 `docs/` 目录，按功能拆分：
  - `overview/` – 项目总览、onboarding、概念解释（本文件所在位置）。
  - `design/` – 设计文档 / RFC / 架构方案。
  - `spec/` – 行为规范、接口定义、交互细节。
  - `task/` – 任务/Issue 风格文档，驱动任务列表。
- 文档是"期望世界"的描述，代码是"实际世界"，rantcode 负责在两者之间建立桥梁。

## 3. 主界面与视图

### ControllerShell（应用外壳）

- 顶部标题栏：
  - 左：项目选择下拉（替代传统“项目列表页面”）。
  - 右：主题开关（Light / Dark）。
  - 整条区域是自绘 titlebar，支持双击最大化窗口。
- 主内容区域：
  - 若选中项目 → 展示该项目的 Workspace。
  - 若未选中项目 → 展示 Projects Landing（项目选择/新增）。

### Workspace（三列布局）

当前 Workspace 主要是三列 Panel（可拖拽）：

1. **左列：会话 + 文件树**
   - 上半部分：Sessions 列表（会话卡片，可新建/切换）。
   - 下半部分：Files / Docs 树（MagicUI file‑tree）。
   - 垂直方向可拖拽调整 Sessions 与 Files 的高度。

2. **中列：对话区域**
   - 展示当前 Session 的消息气泡（user / assistant）。
   - 下方是输入框和发送按钮。
   - 未来会把模型调用、上下文设置等控制放在这一列的附近。

3. **右列：文件预览**
   - 支持 Markdown 渲染 + 代码高亮（Shiki + Vitesse 主题）。
   - 顶部右侧有 TOC 图标，点击弹出浮动目录，快速跳转到文档各级标题。
   - 预览区域支持滚动，和中列聊天区互不干扰。

### Spec Explorer（文档浏览器）

- 左：Docs / Repo 文件树。
- 右：Markdown 预览 + TOC。
- 主要用途：
  - 浏览规格文档、设计文档。
  - 将某个文档“送入”右侧 Workspace 预览或会话上下文（后续可以加上显式操作）。

### Diff View（变更视图）

- 根据后端 `/api/diff/*` 接口展示当前仓库的变更：
  - 左列：按 group（路径 / 类型）分组的文件列表。
  - 右列：Diff 内容（统一 / 左右对比视图）。
- 设计目的：
  - 把“文档里的任务/规范”和“真正的代码修改”对齐。
  - 给 AI 一个结构化的变更视图，便于生成 review / 总结。

### Work View（任务盘）

- 从 `docs/task/` 文档中提取 TaskItem（带状态、owner、优先级等）。
- 视图包含：
  - 筛选区：Status / Owner / Priority / 关键词。
  - 列表区：任务表格（Title, Status, Owner, Priority, Due）。
- 设计目的：
  - 把“文档里的 TODO/任务”变成可操作的任务视图。
  - 为 AI 和人类提供统一的“下一步工作清单”。

## 4. Provider / Model 配置（Settings）

### Provider（提供方）

- 对应一个后端服务或 API：
  - 如：OpenAI、Anthropic、Google、Ollama、本地代理等。
  - 字段包含：`name`, `type`, `base_url`, `models[]` 等。
- Settings 左侧列表展示所有 Provider，支持：
  - 新增 / 删除 Provider。
  - 重命名 Provider key。

### Model（模型）

- 属于某个 Provider 的一个具体模型：
  - 例如：`gpt-5.1`, `gpt-5.1-mini`, `claude-4.5-sonnet`, 本地 `qwen-coder` 等。
  - 目前主要是元数据（名称、id），未来可以扩展温度、最大 token 等参数。

### 设计方向

- 把 “Codex / Claude Code / 其他 coder 模型” 抽象为：
  - Provider + Model + 能力标签（例如：code 优化、重构、解释、测试生成等）。
- 在 Workspace / Session 层面：
  - 可以选择“当前会话使用哪个模型/策略”。
  - 也可以在 Work / Diff 等视图中，为特定操作绑定特定模型（例如：Diff Review 用一个更贵的模型）。

## 5. 未来设计讨论的锚点

后续在讨论交互/设计时，可以以这几个问题为锚点继续细化：

1. **会话与文档/任务的关系**
   - 如何从 Spec / Task 文档一键“开一个会话”或“附加到当前会话上下文”？
   - 如何在会话中引用/插入文档片段、Diff 片段？

2. **多模型策略**
   - 是否需要“策略级别”的抽象（例如：Review 策略、Refactor 策略），再映射到底层模型？
   - 不同 Provider 的延迟/成本如何在 UI 上提示？

3. **状态可见性**
   - Task 状态（task docs）、Diff 状态（git）、Session 状态（进行中/归档）如何统一呈现？
   - 是否需要一个 Dashboard 式的总览视图？

4. **与本地工具链的协作**
   - 例如：与编辑器、终端、测试运行的联动（这部分目前在“未来工作”）。

这份文档只定义名词和信息结构，不绑定具体的 UI 细节；后续可以在 `docs/design/` 里沉淀交互设计稿和更细致的流程说明。
