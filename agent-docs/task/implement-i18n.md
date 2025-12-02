---
title: 实现国际化（i18n）支持
status: done
priority: P1
owner: AI
---

# 实现国际化（i18n）支持

## 目标

为 Rantcode 添加完整的国际化支持，实现中文（zh-CN）和英文（en-US）界面切换，与现有语言设置联动。

## 设计文档

详见 `docs/spec/i18n.md`

## 待办

### Phase 1: 基础设施 [预计 2h] ✅

- [x] 安装依赖 `i18next` 和 `react-i18next`
- [x] 创建 `src/renderer/src/lib/i18n.ts` 配置文件
- [x] 创建 `src/renderer/src/locales/` 目录结构
- [x] 在 `main.tsx` 中初始化 i18n
- [x] 实现与 `generalSettings.language` 的联动

### Phase 2: 翻译文件 [预计 1h] ✅

- [x] 创建 `locales/zh-CN.json` - 中文翻译
- [x] 创建 `locales/en-US.json` - 英文翻译

### Phase 3: 核心页面迁移 [预计 3-4h] ✅

#### P0 - 高优先级 ✅

- [x] `AppShell.tsx` - 顶部导航栏
- [x] `StatusBar.tsx` - 底部状态栏（无需翻译）
- [x] `ProjectsPage.tsx` - 项目列表页

#### P1 - 中优先级 ✅

- [x] `SettingsPage.tsx` - 设置页面框架
- [x] `SingleClaudeVendor.tsx` - Agent 配置
- [x] `AudioFxSettings.tsx` - 音效设置
- [x] `SfxSettings.tsx` - UI 音效
- [x] `TTSSettings.tsx` - TTS 设置

#### P2 - 低优先级 ✅

- [x] `SessionList.tsx` - 会话列表
- [x] `Composer.tsx` - 消息输入框
- [x] `KanbanPanel.tsx` - 看板面板
- [x] `GitPanel.tsx` - Git 面板
- [x] `NotFound.tsx` - 404 页面

### Phase 4: 优化与完善 [预计 1h]

- [ ] 添加 TypeScript 类型声明（可选）
- [x] 检查并补全遗漏的翻译
- [x] 测试语言切换功能

## 技术要点

### 目录结构

```
src/renderer/src/
├── lib/
│   └── i18n.ts
├── locales/
│   ├── zh-CN.json
│   └── en-US.json
```

### 依赖安装

```bash
pnpm add i18next react-i18next@^16.3.5
```

### 基本用法

```tsx
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t } = useTranslation()
  return <h1>{t('projects.title')}</h1>
}
```

### 与 Settings 联动

```tsx
// 监听 generalSettings.language 变化，自动切换 i18n 语言
useEffect(() => {
  if (settings?.language && settings.language !== i18n.language) {
    i18n.changeLanguage(settings.language)
  }
}, [settings?.language])
```

## 验收标准

- [x] 安装依赖后项目正常运行
- [x] Settings 切换语言后界面即时更新
- [x] 刷新页面后语言设置保持
- [x] 所有 P0/P1 页面的文本已翻译
- [x] 无明显的硬编码文本遗漏
- [x] 中英文翻译内容准确

## 注意事项

1. **渐进式迁移**：一次迁移一个模块，保证不破坏现有功能
2. **保持一致性**：翻译风格统一，术语一致
3. **避免过度翻译**：品牌名（rantcode）、技术术语（Codex、Claude）保持原文
4. **插值优先**：动态内容使用插值，避免字符串拼接

## 预估工时

| 阶段 | 工时 |
|------|------|
| Phase 1 | ~2h |
| Phase 2 | ~1h |
| Phase 3 | ~4h |
| Phase 4 | ~1h |
| **总计** | **~8h** |

