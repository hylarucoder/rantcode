---
title: 发布前检查清单
status: in-review
priority: P1
---

# 发布前检查清单

> 本文档记录 rantcode v1.0.0 发布前需要完成的工作项，按优先级和类别分组。

## 概览

| 类别 | 状态 | 说明 |
|------|------|------|
| 代码质量 | 🟢 已修复 | Lint 错误 ✅、测试 ✅、待提交代码 |
| 核心功能 | 🟡 部分完成 | Task 看板、Session 持久化等待实现 |
| 发布配置 | 🟢 已更新 | appId、作者信息 ✅，自动更新 URL 待配置 |
| 已完成功能 | 🟢 就绪 | 项目管理、Agent 执行、会话系统等 |

---

## 1. 代码质量问题（P0）

### 1.1 Lint 错误 ✅ 已修复

~~当前 `pnpm lint` 报告 **20 个错误** 和 **73 个警告**。~~

**已修复**（2025-11-27）：

| 文件 | 修复内容 |
|------|----------|
| `mermaidRuntime.ts` | 移除不必要的 `\"` 转义，改为 `"` |
| `orpcQuery.ts` | 用具体函数类型 `(path: readonly string[], input: unknown) => Promise<unknown>` 替代 `Function` |
| `soundManager.ts` | 用 `import()` 替代 `require()`，添加 `loadDefaults()` 方法 |

当前状态：`pnpm lint` 报告 **0 错误**，2 警告（React Hook Form 兼容性，可忽略）

### 1.2 测试 ✅ 已修复

~~**原因**：`afterLog?.output` 为 `undefined`，导致 `toContain` 断言失败。~~

**已修复**（2025-11-27）：更新 `store.test.ts` 测试用例，适配 `log`/`text` 事件分离：
- `log` 事件只更新 `logs` 数组
- `text` 事件更新 `output` 字段

当前状态：`pnpm test` 全部通过（6 tests passed）

### 1.3 未提交代码

Git 状态显示 **22+ 个文件** 有修改或新增未提交：

- 修改：`src/main/`、`src/renderer/`、`src/shared/` 下多个核心文件
- 新增：`GitPanel.tsx`、`ProjectPage.tsx`、`SessionsView.tsx`、`NotFound.tsx` 等

**状态**：待提交

---

## 2. 功能完成度（P1-P2）

### 2.1 已完成功能 ✅

| 功能 | 说明 |
|------|------|
| 项目管理 | 完整 CRUD + 状态管理 + API Hooks |
| 多 Agent 支持 | Codex / Claude Code (GLM/Official) / Kimi CLI |
| 会话系统 | Session 类型 + 消息列表 + 本地持久化 |
| Git 集成 | GitPanel 支持 unified/split diff 查看 |
| Markdown 预览 | 代码高亮 + Mermaid 图表渲染 |
| Provider 配置 | Settings 页面完整配置管理 |
| 系统通知 | 任务完成/失败通知 |
| 路由系统 | React Router + 404 处理 |
| 文档监控 | docsWatcher 实时监控 docs/ 变更 |

### 2.2 待实现功能

#### Task 看板（P1）✅ 已实现

- **设计状态**：数据模型完成（`docs/design/data-model.md`）
- **已完成**：
  - [x] Kanban UI 组件
  - [x] 从 `docs/task/*.md` 读取任务
  - [x] 解析 frontmatter（status/priority/owner）
  - [x] 拖拽后自动更新文件 frontmatter
- **待实现**：
  - [ ] Session-Task 关联

#### Session 持久化（P2）

- **当前实现**：localStorage（per workspace）
- **目标**：SQLite / IndexedDB
- **待实现**：
  - [ ] Session 搜索和过滤
  - [ ] Message 独立存储（外键关联）
  - [ ] 跨设备同步（可选）

#### TTS 语音提醒（P2）

- **设计文档**：`docs/spec/tts.md`
- **当前状态**：Web Speech 部分实现
- **待实现**：
  - [ ] `/speech/synthesize` oRPC 路由
  - [ ] 云 TTS 适配（豆包/Minimax）
  - [ ] Settings 面板配置
  - [ ] 磁盘缓存

### 2.3 规格文档中的后续任务

来自 `docs/spec/core-entities.md`：

- [ ] 实现 Session 持久化到 SQLite
- [ ] 支持 Session 搜索和过滤
- [ ] 添加 Message 时间戳显示
- [ ] 支持 Message 复制/重发
- [ ] Agent 可用性检测集成到 UI

---

## 3. 发布配置（P1）

### 3.1 package.json ✅ 已更新

```jsonc
{
  "name": "rantcode",
  "version": "0.0.1",
  "description": "Desktop app for managing AI coding agents like Claude Code and Codex",
  "author": "hylarucoder",
  "homepage": "https://rantcode.hylarucoder.io"
}
```

### 3.2 electron-builder 配置 ✅ 已更新

项目使用多渠道配置：

| 配置文件 | App ID | 更新源 |
|----------|--------|--------|
| `electron-builder.stable.yml` | `io.hylarucoder.rantcode` | GitHub Releases (release) |
| `electron-builder.nightly.yml` | `io.hylarucoder.rantcode.nightly` | GitHub Releases (prerelease) |

| 配置项 | 当前值 | 状态 |
|--------|--------|------|
| `publish.provider` | `github` | ✅ 已配置 |
| `publish.owner` | `hylarucoder` | ✅ 已配置 |
| `publish.repo` | `rantcode` | ✅ 已配置 |
| `mac.notarize` | `false` | ⚠️ 上架需设为 `true` |

### 3.3 应用图标

- `build/icon.icns` (macOS)
- `build/icon.ico` (Windows)
- `build/icon.png` (Linux)
- `resources/icon.png`

**状态**：已存在，需确认是否为最终设计。

---

## 4. 发布流程

### 4.1 多渠道版本说明

项目支持两个发布渠道，可以同时安装在同一台机器上：

| 渠道 | App ID | 产品名 | 版本号格式 | 更新通道 |
|------|--------|--------|------------|----------|
| **Stable** | `io.hylarucoder.rantcode` | RantCode | `0.0.1` | stable |
| **Nightly** | `io.hylarucoder.rantcode.nightly` | RantCode Nightly | `0.0.1-nightly.20251127.abc1234` | nightly |

### 4.2 构建命令

```bash
# 本地构建（仅打包，不发布）
pnpm build:stable     # Stable 版本
pnpm build:nightly    # Nightly 版本

# 构建并发布到 GitHub Releases
pnpm release:stable   # 发布正式版（release）
pnpm release:nightly  # 发布预览版（prerelease）
```

**Nightly 版本号格式**：`{baseVersion}-nightly.{YYYYMMDD}.{gitShortHash}`
- 例如：`0.0.1-nightly.20251127.abc1234`

### 4.2.1 GitHub 发布配置

发布到 GitHub Releases 需要配置 `GH_TOKEN` 环境变量：

```bash
# 1. 创建 GitHub Personal Access Token
#    访问: https://github.com/settings/tokens/new?scopes=repo
#    勾选 `repo` 权限

# 2. 设置环境变量
export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# 3. 发布
pnpm release:stable
```

**GitHub Actions 自动发布**（推荐）：

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm release:stable
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**自动更新配置**：

| 渠道 | GitHub Release 类型 | 用户接收更新 |
|------|---------------------|--------------|
| Stable | `release` | 正式版用户 |
| Nightly | `prerelease` | 测试版用户 |

### 4.3 最小可发布版本（MVP）

如果需要快速发布 Beta 版本，可以跳过 Task 看板和 Session 持久化：

```bash
# 1. 修复代码质量
pnpm lint:fix
# 手动修复剩余错误
pnpm test

# 2. 更新版本号
npm version 1.0.0-beta.1

# 3. 构建 Stable 版本
pnpm build:stable

# 4. 测试安装包
# 5. 发布
```

### 4.2 完整发布（v1.0.0）

完成所有 P1 功能后发布正式版：

1. 完成 Task 看板 MVP
2. 完成 Session 持久化
3. 更新所有发布配置
4. 通过完整测试套件
5. 编写 CHANGELOG
6. 发布

---

## 5. 检查清单

### 发布前必须完成

- [x] `pnpm lint` 无错误 ✅ 2025-11-27
- [x] `pnpm typecheck` 通过 ✅ 2025-11-27
- [x] `pnpm test` 全部通过 ✅ 2025-11-27
- [ ] 所有代码已提交
- [x] `package.json` 元信息已更新 ✅ 2025-11-27
- [x] `electron-builder.yml` 配置已更新 ✅ 2025-11-27
- [ ] 应用图标已确认
- [ ] README 已更新

### 发布前建议完成

- [ ] Task 看板 MVP
- [ ] Session 持久化
- [ ] CHANGELOG 编写
- [ ] 用户文档/帮助页面

### 发布后跟进

- [ ] 收集用户反馈
- [ ] 监控崩溃上报
- [ ] 规划 v1.1.0 功能

---

## 附录：相关文档

- 架构设计：`docs/design/architecture.md`
- 数据模型：`docs/design/data-model.md`
- 路由设计：`docs/design/routing.md`
- 核心实体规范：`docs/spec/core-entities.md`
- Agents 边界：`docs/spec/agents-boundary.md`
- TTS 设计：`docs/spec/tts.md`

