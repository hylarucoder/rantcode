# Conversation Log（conversation.log）格式与渲染规范

本文档拆解根目录 `conversation.log` 的结构，给出解析与渲染建议，便于构建更友好的“对话/操作回放”视图。

## 背景与目标

- 文件来源：Codex CLI 交互的完整流水日志，包含会话元信息、用户/助手消息、工具调用、终端命令与结果、文件变更补丁等。
- 目标：
  - 明确可解析的事件类型与字段。
  - 给出稳健的解析规则（基于文本行的状态机）。
  - 提出渲染规范，让阅读更“像对话+终端时间线”，并对大输出做折叠与懒加载。

## 总体结构

日志为“追加式多会话”文本。每段会话通常以如下头部出现：

```
[stderr]OpenAI Codex vX.Y.Z (research preview)
--------
workdir: /path/to/project
model: gpt-5.1
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: auto
session id: <uuid>
--------
```

其后是“事件流”（时间顺序）。常见行首标记与含义：

- `user`：用户消息（下一行起为正文，直到遇到下一个事件标记）。
- `[stderr]codex`：助手在 CLI 中的自然语言回复（下一行起为正文）。
- `[stderr]thinking` / `thinking`：助手思考注释（内部说明，默认建议折叠或隐藏）。
- `[stderr]exec`：即将执行的 shell 命令；紧随其后会出现命令、工作目录与结果。
- `[stderr] succeeded in <N>ms:` / `exited <code> in <N>ms:`：命令/工具执行结果头。
- `[stderr]tool <name>(<json-args>)`：工具调用（函数式 API）及其参数。
- `[stderr]file update:` / `diff --git ...`：对文件的补丁（apply_patch 输出）。
- `[stderr]apply_patch(...) exited 0 in <N>ms:`：补丁应用结果。
- `[stderr]Plan update`：计划工具更新（任务分解与进度）。
- `[stderr]tokens used`：统计信息；通常下一行是数值。
- `Total output lines: <N>`：CLI 为大输出加的计数头（可用于折叠/提示）。
- `[... output truncated to fit 10240 bytes ...]`：输出被截断的标记。

注：大部分“系统事件”在日志中前缀为 `[stderr]`；少量结果摘要可能前缀为 `[stdout]`。

## 事件模型（建议）

为便于前端渲染，推荐抽象为如下事件与字段（TypeScript 伪定义）：

```ts
export type LogEvent =
  | { type: 'session_start'; meta: SessionMeta }
  | { type: 'user'; text: string }
  | { type: 'assistant'; text: string }
  | { type: 'note'; text: string; channel: 'thinking' | 'system' }
  | { type: 'tool_call'; name: string; argsText: string }
  | { type: 'tool_result'; ok: boolean; code?: number; durationMs?: number; text?: string }
  | { type: 'exec_call'; command: string; workdir?: string }
  | { type: 'exec_result'; ok: boolean; code?: number; durationMs?: number; text?: string }
  | { type: 'patch'; header: string; diff: string }
  | { type: 'plan_update'; text: string }
  | { type: 'stats'; name: 'tokens used'; value: string }
  | { type: 'truncated'; reason: string }
  | { type: 'unknown'; raw: string }

export interface SessionMeta {
  workdir?: string
  model?: string
  provider?: string
  approval?: string
  sandbox?: string
  reasoningEffort?: string
  reasoningSummaries?: string
  sessionId?: string
}
```

## 解析规则（基于行的状态机）

1. 会话切分：遇到行首匹配 `^\[stderr\]OpenAI Codex v` 视为新会话开始；读取直到下一条 `--------` 结束头部。解析 `key: value` 到 `SessionMeta`。
2. 事件起始：优先匹配明确标记：
   - `^user$` → 收集后续多行正文，直到下一个以 `[` 开头的标记或 `user`/空行后的系统标记。
   - `^\[stderr\]codex$` → 收集助手正文，直到下一个标记。
   - `^\[stderr\]thinking$|^thinking$` → 收集思考正文。
   - `^\[stderr\]exec$` → 下一行一般为 `bash -lc ... in <workdir>`；记录 `command` 与 `workdir`。
   - 随后出现的 `^\[stderr\] succeeded in (\d+)ms:` 或 `exited (\d+) in (\d+)ms:` → 作为 `exec_result`/`tool_result` 头；继续收集其后的输出正文，直到下一个事件标记。
   - `^\[stderr\]tool\s+([^(]+)\((.*)\)` → 记录 `tool_call`（`argsText` 原样保存）。
   - `^\[stderr\]file update` 或 `^diff --git` → 收集补丁，直到下一个事件标记。
   - `^\[stderr\]Plan update$` → 收集计划文本块（通常是打钩的步骤列表）。
   - `^\[stderr\]tokens used$` → 下一行读取为统计值。
   - `^Total output lines:` 或 `^\[\.\.\. output truncated` → 记录为 `truncated`/统计事件。
3. 输出正文：对命令/工具/补丁的正文，按“遇到下一个事件标记行”结束。为避免误切，可将“以 `[` 开头且包含已知关键词”的行视作事件起始。
4. 容错：无法识别的行作为 `unknown` 保留以防信息丢失。

## 渲染规范（建议）

- 顶部会话卡片
  - 显示 `model`、`sessionId`、`workdir`、`sandbox/approval`。
  - 提供“复制元信息”按钮。
- 时间线（从上到下）：
  - `user` → 用户消息卡片（保留换行，支持 Markdown inline）。
  - `assistant` → 助手回复卡片（支持 Markdown，代码高亮）。
  - `exec_call` → 终端命令卡片：显示 `workdir`（若变化则高亮），命令可复制。
  - `exec_result` → 结果卡片：成功/失败状态、耗时；输出正文默认折叠（大于 50 行折叠，显示“Total output lines”信息）。
  - `tool_call` / `tool_result` → 使用“拼图”图标；参数/返回以代码块展示，长文折叠。
  - `patch` → 显示统一的 diff 视图（左右或内联高亮）；提供“应用/复制补丁”按钮（只读环境仅复制）。
  - `plan_update` → 渲染为 checklist（✓/⬜）。
  - `note(thinking)` → 默认折叠，仅在需要复盘时展开。
  - `stats(tokens used)` → 以徽章样式展示。
- 大输出与分页
  - 若检测到 `Total output lines: N` 或截断标记，默认只渲染首尾若干行；提供“展开全部/下载原始输出”。
- 细节与增强
  - 识别 `path:line` 形式的文件位点，点击在编辑器打开。
  - `succeeded in <N>ms`/`exited 0/1` 用成功/失败颜色编码；耗时以固定宽度对齐。
  - 将 `workdir` 变化显示为“路径面包屑”，方便跨仓库操作时定位。

## 安全与隐私

- `thinking` 可能包含敏感推理过程；默认折叠或支持全局隐藏。
- 终端输出可能包含 token、环境变量、路径信息；支持“脱敏模式”（掩码常见变量名与秘密样式）。
- 补丁内容仅回放展示；应用补丁需显式确认。

## 性能建议

- 文件可达数百 KB；解析采用“流式行读取 + 事件管道”。
- 先构建“目录索引”（事件偏移表），渲染时按需懒加载大块输出。
- 在 Electron 中建议：
  - `main` 负责读取文件流并通过 IPC 发送块；
  - `renderer` 用 Web Worker 解析，主线程只负责渲染与交互；
  - 超大输出使用虚拟列表组件。

## 最小示例（节选）

```
[stderr]OpenAI Codex v0.57.0 (research preview)
--------
workdir: /path/to/project
model: gpt-5.1
session id: abc-123
--------
user
请你帮我整理 docs 下面的文档...
[stderr]codex
我先看一下 `docs` 目录...
[stderr]exec
bash -lc ls -R in /path/to/project
[stderr] succeeded in 42ms:
AGENTS.md
...
[stderr]Plan update
  ✓ 写计划
  ✓ 实施
[stderr]file update:
diff --git a/docs/README.md b/docs/README.md
--- a/docs/README.md
+++ b/docs/README.md
@@ -1,3 +1,3 @@
-旧内容
+新内容
[stderr]tokens used
107,142
```

## 落地与后续

- 若需要，我可以按上述模型提供：
  - 解析器（TypeScript，流式行解析 + 事件聚合）。
  - React 渲染组件（时间线视图、折叠/搜索/复制、diff 视图）。
- 也可将解析结果导出为 JSON（便于搜索与二次加工）。
