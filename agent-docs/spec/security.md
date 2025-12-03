# 安全建议（Electron + Markdown）

下面是针对当前工程的几条实用强化建议，均为低风险、可渐进引入：

## 窗口与 WebPreferences

当前已配置（`src/main/windowService.ts`）：

- ✅ `contextIsolation: true` - 隔离渲染进程上下文
- ✅ `nodeIntegration: false` - 禁止渲染进程直接访问 Node.js
- ✅ `webSecurity: true` - 启用同源策略
- ⚠️ `sandbox: false` - 未启用沙箱（如需开启，需评估 MessagePort/preload 行为）

可选优化：

- `disableBlinkFeatures: 'Auxclick'`
- 使用自定义 `userAgent`（便于排查）

> 主窗口和子窗口均已正确配置安全选项，通过 `contextBridge.exposeInMainWorld` 安全地暴露 API。

## CSP 与 Markdown

- `src/renderer/index.html` 已设置 CSP；在 Markdown 渲染管线中启用了 `rehype-raw`，建议新增 `rehype-sanitize` 基于 allowlist（heading、p、ul/ol、table、code/pre、a/img 等）来降低 XSS 风险。
- 保留 Shiki 高亮，优先过滤/转义危险标签与属性（style/on\*）。

## IPC / oRPC

- 保持 preload 暴露 API 的最小化：仅输出 `electron/orpc/docs/codex` 四个命名空间。
- oRPC 入参与出参已通过 zod 验证（main 侧仍建议对 filesystem path 再做一次范围校验）。

## 错误处理

- 统一 `catch (e: unknown)`，并通过 `isErrorLike()` 或 `instanceof Error` 缩小；避免直接读取未知对象的属性。
