---
title: 实现多角色协作系统
status: in_progress
priority: P2
owner: AI
---

# 实现多角色协作系统

## 目标

构建 AI 角色协作流水线，覆盖从需求分析到测试验收的完整软件开发周期。

## 当前状态

**已完成**：
- ✅ Agent 配置抽象层（`src/shared/agents.ts`）
- ✅ 预设 Agent 定义（analyst/architect/developer/tester/general）
- ✅ Agent System Prompt 模板
- ✅ Agent 能力枚举（read_file/write_file/execute_cmd 等）

**待实现**：
- ⬜ 角色选择器 UI
- ⬜ Requirement/Task/TestCase 数据模型
- ⬜ 产物（Artifact）存储与检索
- ⬜ 检查点（Gate）机制
- ⬜ 自动流转模式

## 设计文档

详见 `agent-docs/design/multi-role-collaboration.md`

## 角色定义

| 角色 | 职责 | 主要产出 |
|------|------|----------|
| Analyst（需求师） | 理解用户意图，输出结构化需求 | 需求文档 |
| Architect（架构师） | 拆解任务，确定技术方案 | 任务清单 |
| Developer（开发者） | 按任务清单实现代码 | 代码变更 |
| Tester（测试员） | 验证实现是否满足需求 | 测试报告 |

## 待办

### Phase 1: 基础设施（1-2 周）

- [ ] 定义 Requirement/Task/TestCase 数据模型
- [ ] 实现角色 System Prompt 配置管理
- [ ] 扩展 Session 支持 role 字段
- [ ] 实现产物（Artifact）存储与检索

### Phase 2: 单角色体验（1 周）

- [ ] 实现角色选择器 UI
- [ ] 集成需求分析师角色
- [ ] 集成架构师角色
- [ ] 测试角色切换与上下文传递

### Phase 3: 完整流水线（1-2 周）

- [ ] 集成开发者角色
- [ ] 集成测试工程师角色
- [ ] 实现检查点（Gate）机制
- [ ] 实现回退与重做

### Phase 4: 自动化与优化（持续）

- [ ] 实现自动流转模式
- [ ] 添加流程进度可视化
- [ ] 集成代码审查工具
- [ ] 性能优化与 token 管理

## 技术要点

### 数据模型

```typescript
interface Requirement {
  id: string
  title: string
  description: string
  userStories: UserStory[]
  acceptanceCriteria: string[]
  status: 'draft' | 'confirmed' | 'in_progress' | 'done'
}

interface Task {
  id: string
  requirementId: string
  title: string
  files: FileRef[]
  estimate: string
  priority: number
  dependencies: string[]
  status: 'pending' | 'in_progress' | 'review' | 'done'
}

interface RoleSession {
  id: string
  role: RoleType
  requirementId: string
  messages: Message[]
  artifacts: Artifact[]
}

type RoleType = 'analyst' | 'architect' | 'developer' | 'tester'
```

### System Prompt 文件结构

```
src/shared/roles/
  analyst.md       # 需求分析师
  architect.md     # 架构师
  developer.md     # 开发者
  tester.md        # 测试工程师
```

### UI 组件

- 角色选择器（ActivityBar 或顶部）
- 流程进度条
- 产物面板（右侧或底部）

## 验收标准

- [ ] 可在 UI 中切换不同角色
- [ ] 各角色有独立的 System Prompt 和行为约束
- [ ] 产物（需求文档、任务清单等）可正常生成和存储
- [ ] 角色间可通过产物传递上下文
- [ ] 检查点机制正常工作

