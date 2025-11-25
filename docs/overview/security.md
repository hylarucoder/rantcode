# 安全建议（Electron + Markdown）

下面是针对当前工程的几条实用强化建议，均为低风险、可渐进引入：

## 窗口与 WebPreferences

- 显式开启：
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: false`（如要开启 sandbox，需要评估 MessagePort/preload 行为）
- 其他推荐：
  - `webSecurity: true`
  - `disableBlinkFeatures: 'Auxclick'`
  - 使用自定义 `userAgent`（便于排查）

> 目前 `src/main/index.ts` 使用了 preload，并通过 contextBridge 暴露必要 API；建议补充 `contextIsolation: true` 以避免 Renderer 获取 Node 能力。

## CSP 与 Markdown

- `src/renderer/index.html` 已设置 CSP；在 Markdown 渲染管线中启用了 `rehype-raw`，建议新增 `rehype-sanitize` 基于 allowlist（heading、p、ul/ol、table、code/pre、a/img 等）来降低 XSS 风险。
- 保留 Shiki 高亮，优先过滤/转义危险标签与属性（style/on\*）。

## IPC / oRPC

- 保持 preload 暴露 API 的最小化：仅输出 `electron/orpc/docs/codex` 四个命名空间。
- oRPC 入参与出参已通过 zod 验证（main 侧仍建议对 filesystem path 再做一次范围校验）。

## 错误处理

- 统一 `catch (e: unknown)`，并通过 `isErrorLike()` 或 `instanceof Error` 缩小；避免直接读取未知对象的属性。
