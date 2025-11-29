/**
 * Agent 配置 - 用户可配置的 AI 助手
 *
 * Agent 是业务层的概念，定义：
 * - 职责和行为（通过 System Prompt）
 * - 允许的能力（读写文件、执行命令等）
 * - 默认使用的 Runner（底层执行器）
 *
 * Runner 是技术层的概念（见 runners.ts），负责实际调用 CLI 工具。
 *
 * 关系：Agent 通过 Runner 执行任务
 * 示例：「开发 Agent」使用「Claude Code」Runner 来实现代码
 */

import type { Runner } from './runners'

/** Agent 能力枚举 */
export type AgentCapability =
  | 'read_file' // 读取文件
  | 'write_file' // 修改文件
  | 'execute_cmd' // 执行命令
  | 'browse_web' // 浏览器交互
  | 'search_code' // 搜索代码库

/** 预设 Agent ID */
export type PresetAgentId = 'analyst' | 'architect' | 'developer' | 'tester' | 'general'

/** Agent 配置 */
export interface AgentConfig {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 描述 */
  description?: string
  /** System Prompt - 定义 Agent 的行为 */
  systemPrompt: string
  /** 允许的能力 */
  capabilities: AgentCapability[]
  /** 默认使用的 Runner */
  defaultRunner?: Runner
  /** 期望产物格式（YAML schema，可选） */
  outputSchema?: string
  /** 是否为预设 Agent */
  isPreset?: boolean
}

/** 预设 Agent 列表 */
export const PRESET_AGENTS: AgentConfig[] = [
  {
    id: 'general',
    name: '通用助手',
    description: '通用开发助手，无特定职责约束',
    systemPrompt: '', // 空表示使用 Runner 默认行为
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

## 工作流程
1. 仔细阅读用户输入
2. 如有不清楚的地方，先提问（每次最多 3 个问题）
3. 待用户回答后，整理需求文档
4. 让用户确认需求，根据反馈修改

## 输出格式
使用 YAML 格式输出需求文档，包含以下字段：
- id: 需求编号
- title: 简短标题
- description: 详细描述
- user_stories: 用户故事列表
- acceptance_criteria: 验收标准（可测试的条件）
- constraints: 技术/业务约束
- out_of_scope: 明确排除的内容

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

## 工作流程
1. 阅读需求文档
2. 分析相关代码文件（使用工具）
3. 设计技术方案
4. 拆分任务清单
5. 输出任务文档供确认

## 输出格式
使用 YAML 格式输出任务清单，每个任务包含：
- id: 任务编号
- title: 任务标题
- description: 详细说明
- files: 涉及的文件（标注 new/modify）
- estimate: 预估时间
- priority: 优先级（1 最高）
- dependencies: 依赖的其他任务 ID

## 任务拆分原则
- 单个任务应在 2 小时内可完成
- 任务之间依赖关系清晰
- 每个任务产出可独立验证
- 优先拆出无依赖的基础任务

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

## 工作流程
1. 阅读当前任务详情
2. 查看涉及的文件内容
3. 按需求实现代码
4. 自检：lint、类型检查
5. 输出代码变更

## 约束
- 严格按任务范围实现，不擅自扩展
- 遵循项目编码规范
- 保持代码风格与现有代码一致
- 复杂逻辑添加注释
- 不删除不相关的代码

## 代码规范
- TypeScript 严格模式
- 函数/变量使用 camelCase
- 组件使用 PascalCase
- 常量使用 SCREAMING_SNAKE_CASE`,
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

## 工作流程
1. 阅读需求文档的验收标准
2. 设计测试用例（正常 + 异常 + 边界）
3. 执行测试（可使用浏览器工具）
4. 记录实际结果
5. 输出测试报告

## 测试用例设计原则
- 每个验收标准至少一个用例
- 覆盖边界值（空、最大、最小）
- 覆盖异常路径
- 考虑并发和性能场景

## 输出格式
使用 YAML 格式输出测试报告，包含：
- test_cases: 用例列表（id/title/steps/expected/actual/status）
- summary: 统计（total/passed/failed/blocked）
- bugs: Bug 列表（如有）

## Bug 报告格式
- id: Bug 编号
- severity: critical/high/medium/low
- title: 简短描述
- description: 详细说明和复现步骤
- location: 问题代码位置（如能定位）`,
    capabilities: ['read_file', 'execute_cmd', 'browse_web', 'search_code'],
    isPreset: true
  }
]

/** Agent UI 配置 - 用于选择器显示 */
export interface AgentUIConfig {
  value: string
  label: string
  description?: string
}

/** UI 选择器使用的 Agent 列表 */
export const AGENT_UI_LIST: AgentUIConfig[] = PRESET_AGENTS.map((a) => ({
  value: a.id,
  label: a.name,
  description: a.description
}))

/** 根据 ID 获取预设 Agent */
export function getPresetAgent(id: string): AgentConfig | undefined {
  return PRESET_AGENTS.find((a) => a.id === id)
}

/** 根据 ID 获取 Agent（支持自定义 Agent，后续扩展） */
export function getAgent(id: string, customAgents?: AgentConfig[]): AgentConfig | undefined {
  // 先查找预设
  const preset = getPresetAgent(id)
  if (preset) return preset
  // 再查找自定义
  return customAgents?.find((a) => a.id === id)
}

/**
 * 构建带有 Agent System Prompt 的完整 Prompt
 * @param agent Agent 配置
 * @param userPrompt 用户输入
 * @returns 完整的 prompt
 */
export function buildAgentPrompt(agent: AgentConfig, userPrompt: string): string {
  if (!agent.systemPrompt) {
    return userPrompt
  }
  return `${agent.systemPrompt}\n\n---\n\n${userPrompt}`
}
