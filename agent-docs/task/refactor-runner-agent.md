---
status: done
---

# 重构：Runner + Agent 概念分离

> 目标：将现有的 "Agent" 概念拆分为 "Runner"（底层执行器）和 "Agent"（用户可配置的助手），实现清晰的职责分离。

## 1. 背景

### 1.1 当前问题

现有代码中 `Agent` 一词同时承载了两个含义：

1. **底层执行器**：Claude Code、Codex 等 CLI 工具的封装
2. **角色配置**：多角色协作设计中的 Analyst、Architect 等

这导致概念混淆，不利于后续扩展。

### 1.2 新概念定义

| 概念 | 定义 | 例子 |
|------|------|------|
| **Runner** | 底层 AI 执行器，负责实际调用 CLI 工具 | `codex`, `claude-code`, `claude-code-glm` |
| **Agent** | 用户可配置的助手，定义职责、System Prompt、能力约束 | 需求分析 Agent、架构 Agent、开发 Agent |

### 1.3 关系

```
┌─────────────────┐     驱动      ┌─────────────────┐
│     Runner      │ ────────────▶ │     Agent       │
│  (Claude Code)  │               │ (需求分析 Agent) │
│  (Codex)        │               │ (架构 Agent)     │
│  (Gemini CLI)   │               │ (开发 Agent)     │
└─────────────────┘               └─────────────────┘
     技术层                              业务层
   「怎么执行」                        「代表谁行事」
```

## 2. 变动范围评估

### 2.1 需要重命名的文件/目录

| 原路径 | 新路径 | 说明 |
|--------|--------|------|
| `src/shared/agents.ts` | `src/shared/runners.ts` | Runner 类型定义 |
| `src/main/agents/` | `src/main/runners/` | Runner 实现目录 |
| `src/main/agents/detect.ts` | `src/main/runners/detect.ts` | Runner 检测 |
| `src/main/agents/claudecode/` | `src/main/runners/claudecode/` | Claude Code Runner |
| `src/main/agents/codex/` | `src/main/runners/codex/` | Codex Runner |
| `src/preload/bridges/agents.ts` | `src/preload/bridges/runners.ts` | Runner Bridge |

### 2.2 需要重命名的类型/变量

| 原名称 | 新名称 | 位置 |
|--------|--------|------|
| `Agent` (type) | `Runner` | `src/shared/runners.ts` |
| `AgentUIConfig` | `RunnerUIConfig` | `src/shared/runners.ts` |
| `AGENT_UI_LIST` | `RUNNER_UI_LIST` | `src/shared/runners.ts` |
| `AGENT_VALUES` | `RUNNER_VALUES` | `src/shared/runners.ts` |
| `AgentConfig` | `RunnerConfig` | `src/main/runners/detect.ts` |
| `AGENT_CONFIGS` | `RUNNER_CONFIGS` | `src/main/runners/detect.ts` |
| `AgentsBridge` | `RunnersBridge` | `src/preload/bridges/runners.ts` |
| `createAgentsBridge` | `createRunnersBridge` | `src/preload/bridges/runners.ts` |

### 2.3 需要调整的类型

```typescript
// src/shared/types/webui.ts

// 保持 AgentRunOptions，但字段含义更新
export interface AgentRunOptions {
  runner?: Runner          // 原 agent 字段，重命名为 runner
  agentId?: string         // 新增：使用的 Agent ID
  projectId?: string
  prompt: string
  extraArgs?: string[]
  timeoutMs?: number
  jobId?: string
  sessionId?: string
}

// AgentEvent 保持不变（事件是跟运行相关的）
```

### 2.4 受影响的文件（需要更新 import/使用）

根据 grep 结果，以下 26 个文件需要更新：

**主进程（Main）**
- `src/main/orpcBridge.ts`
- `src/main/agents/` 下所有文件 → 移动到 `src/main/runners/`

**预加载（Preload）**
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/preload/bridges/agents.ts` → `runners.ts`

**共享（Shared）**
- `src/shared/agents.ts` → `runners.ts`
- `src/shared/types/webui.ts`
- `src/shared/orpc/contract.ts`
- `src/shared/orpc/schemas.ts`

**渲染进程（Renderer）**
- `src/renderer/src/features/workspace/components/AgentMessageBubble.tsx`
- `src/renderer/src/features/workspace/components/CodexMessageBubble.tsx`
- `src/renderer/src/features/workspace/components/AssistantPanel.tsx`
- `src/renderer/src/features/workspace/components/Composer.tsx`
- `src/renderer/src/features/workspace/hooks/useCodexRunner.ts`
- `src/renderer/src/features/workspace/state/store.ts`
- `src/renderer/src/features/workspace/state/store.test.ts`
- `src/renderer/src/features/workspace/types.ts`
- `src/renderer/src/features/workspace/views/WorkspaceLayout.tsx`
- `src/renderer/src/features/workspace/views/SessionsView.tsx`
- `src/renderer/src/features/workspace/index.ts`
- `src/renderer/src/features/settings/api/agentsHooks.ts`
- `src/renderer/src/settings/SingleClaudeVendor.tsx`
- `src/renderer/src/settings/SettingsPage.tsx`
- `src/renderer/src/state/codexLogs.ts`

### 2.5 新增文件

| 文件 | 说明 |
|------|------|
| `src/shared/agents.ts` | **新** Agent 类型定义（用户可配置的助手） |
| `src/shared/roles/` | Agent 预设 System Prompt（可选，或内嵌） |

## 3. 新增 Agent 数据模型

### 3.1 类型定义

```typescript
// src/shared/agents.ts（新文件）

import type { Runner } from './runners'

/** Agent 能力枚举 */
export type AgentCapability = 
  | 'read_file'      // 读取文件
  | 'write_file'     // 修改文件
  | 'execute_cmd'    // 执行命令
  | 'browse_web'     // 浏览器交互
  | 'search_code'    // 搜索代码库

/** 预设 Agent 类型 */
export type PresetAgentId = 
  | 'analyst'     // 需求分析
  | 'architect'   // 架构设计
  | 'developer'   // 开发实现
  | 'tester'      // 测试验证
  | 'general'     // 通用助手

/** Agent 配置 */
export interface AgentConfig {
  id: string                      // 唯一标识
  name: string                    // 显示名称
  description?: string            // 描述
  systemPrompt: string            // System Prompt
  capabilities: AgentCapability[] // 允许的能力
  defaultRunner?: Runner          // 默认使用的 Runner
  outputSchema?: string           // 期望产物格式（YAML schema）
  isPreset?: boolean              // 是否为预设 Agent
}

/** 预设 Agent 列表 */
export const PRESET_AGENTS: AgentConfig[] = [
  {
    id: 'general',
    name: '通用助手',
    description: '通用开发助手，无特定职责约束',
    systemPrompt: '', // 空表示使用 Runner 默认
    capabilities: ['read_file', 'write_file', 'execute_cmd', 'search_code'],
    isPreset: true
  },
  {
    id: 'analyst',
    name: '需求分析 Agent',
    description: '理解用户意图，输出结构化需求',
    systemPrompt: `# Role: 需求分析师

你是一位经验丰富的需求分析师，擅长理解用户意图并将其转化为结构化需求。

## 职责
1. 理解用户描述的功能需求
2. 通过提问澄清模糊点
3. 识别边界条件和约束
4. 输出标准格式的需求文档

## 约束
- 不要假设用户没说的内容
- 验收标准必须是可测试的
- 如有技术问题，标记为"待架构师确认"`,
    capabilities: ['read_file', 'search_code'],
    isPreset: true
  },
  {
    id: 'architect',
    name: '架构 Agent',
    description: '将需求拆解为可执行任务，确定技术方案',
    systemPrompt: `# Role: 架构师

你是一位资深架构师，擅长将需求转化为可执行的技术任务。

## 职责
1. 分析需求文档和现有代码库
2. 确定技术实现方案
3. 将需求拆解为原子任务
4. 评估风险和依赖

## 约束
- 遵循项目现有架构和约定
- 不引入不必要的新依赖
- 复杂方案需说明理由和备选项`,
    capabilities: ['read_file', 'search_code'],
    isPreset: true
  },
  {
    id: 'developer',
    name: '开发 Agent',
    description: '按照任务清单实现代码',
    systemPrompt: `# Role: 开发者

你是一位专业开发者，负责按照任务清单实现代码。

## 职责
1. 理解任务描述和技术方案
2. 阅读相关代码上下文
3. 实现符合规范的代码
4. 确保代码可运行且通过检查

## 约束
- 严格按任务范围实现，不擅自扩展
- 遵循项目编码规范
- 保持代码风格与现有代码一致`,
    capabilities: ['read_file', 'write_file', 'execute_cmd', 'search_code'],
    isPreset: true
  },
  {
    id: 'tester',
    name: '测试 Agent',
    description: '验证实现是否满足需求',
    systemPrompt: `# Role: 测试工程师

你是一位细致的测试工程师，负责验证代码实现是否满足需求。

## 职责
1. 根据需求设计测试用例
2. 覆盖正常流程和边界情况
3. 执行测试并记录结果
4. 发现问题时提交 Bug 报告

## 约束
- 每个验收标准至少一个用例
- 覆盖边界值和异常路径`,
    capabilities: ['read_file', 'execute_cmd', 'browse_web', 'search_code'],
    isPreset: true
  }
]
```

### 3.2 运行时组合

```typescript
// 使用示例
const runner: Runner = 'claude-code'
const agent: AgentConfig = PRESET_AGENTS.find(a => a.id === 'developer')!

// 运行时，Runner 接收 Agent 的 systemPrompt 作为前置指令
await runnersBridge.run({
  runner,
  agentId: agent.id,
  prompt: agent.systemPrompt + '\n\n---\n\n' + userPrompt,
  // ...
})
```

## 4. 实施计划

### Phase 1：重命名 Agent → Runner（~2h）✅ 已完成

- [x] 1.1 重命名 `src/shared/agents.ts` → `src/shared/runners.ts`
  - 更新类型名称：`Agent` → `Runner`
  - 更新常量名称：`AGENT_*` → `RUNNER_*`
  
- [x] 1.2 重命名 `src/main/agents/` → `src/main/runners/`
  - 移动目录
  - 更新内部 import
  
- [x] 1.3 重命名 `src/preload/bridges/agents.ts` → `runners.ts`
  - 更新函数名称
  
- [x] 1.4 更新所有 import 路径和类型引用
  - 批量搜索替换
  - 手动检查特殊情况

- [x] 1.5 更新 `src/shared/types/webui.ts`
  - `AgentRunOptions.agent` → `AgentRunOptions.runner`
  - 保持 `AgentEvent` 不变（或改名为 `RunEvent`）

- [ ] 1.6 验证：运行 `pnpm typecheck` 和 `pnpm lint`

### Phase 2：新增 Agent 层（~1.5h）✅ 已完成

- [x] 2.1 创建 `src/shared/agents.ts`（新文件）
  - 定义 `AgentConfig` 类型
  - 定义 `AgentCapability` 类型
  - 实现 `PRESET_AGENTS` 预设列表
  - 实现 `buildAgentPrompt()` 辅助函数
  
- [ ] 2.2 扩展 `AgentRunOptions`（后续可选）
  - 添加 `agentId?: string` 字段
  
- [ ] 2.3 更新 Runner 调用逻辑（后续可选）
  - 在 `src/main/runners/codex/runner.ts` 中
  - 如果有 `agentId`，查找对应 Agent 并注入 systemPrompt

### Phase 3：UI 适配（~1h）

- [ ] 3.1 更新 Composer 组件
  - Runner 选择器（现有）
  - 新增 Agent 选择器（可选）
  
- [ ] 3.2 更新消息气泡组件
  - 显示使用的 Agent 名称（如有）

### Phase 4：文档更新（~0.5h）

- [ ] 4.1 更新 `agent-docs/design/multi-role-collaboration.md`
  - 使用新的 Runner + Agent 概念
  
- [ ] 4.2 更新代码注释和 JSDoc

## 5. 风险与注意事项

### 5.1 兼容性

- **Session 持久化**：如果现有 Session 存储了 `agent` 字段，需要迁移到 `runner`
- **oRPC 契约**：如果 API 有 `agent` 参数，需要同步更新

### 5.2 命名冲突

- 新的 `Agent` 类型与旧的重名，确保旧代码全部清理
- 建议先完成 Phase 1 再开始 Phase 2

### 5.3 测试覆盖

- `src/renderer/src/features/workspace/state/store.test.ts` 需要更新
- 手动测试各 Runner 的运行流程

## 6. 开放问题

1. **Agent 持久化**：用户自定义的 Agent 是否需要持久化？
   - 建议：先只支持预设 Agent，后续再加用户自定义

2. **System Prompt 注入方式**：
   - 选项 A：直接拼接到 prompt 前面
   - 选项 B：通过 CLI 参数传递（如 Claude Code 的 `--system-prompt`）
   - 建议：先用选项 A，简单直接

3. **能力约束如何执行**：
   - Agent 的 `capabilities` 目前只是声明，Runner 层如何执行约束？
   - 建议：Phase 1-3 先不实现，作为后续增强

---

## 附录：变更检查清单

重命名完成后，运行以下命令验证：

```bash
# 确保没有遗漏的旧引用
grep -r "from.*agents" src/ --include="*.ts" --include="*.tsx" | grep -v runners
grep -r "AgentConfig" src/ --include="*.ts" --include="*.tsx"
grep -r "AGENT_CONFIGS" src/ --include="*.ts" --include="*.tsx"

# 类型检查
pnpm typecheck

# Lint 检查
pnpm lint

# 开发模式运行测试
pnpm dev
```

