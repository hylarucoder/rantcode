# 测试策略（Workspace/Preview 模块为例）

> 目标：在持续重构 Workspace 与预览面板期间，确保关键路径（会话持久化、Codex 事件处理、文档预览）具备可回归的自动化测试。以下策略可逐步落地，优先覆盖“纯逻辑 → Hook → 视图”三个层次。

## 1. Store 层（逻辑单元测试）

- **工具**：Vitest 或 Jest（推荐 Vitest，和 Vite/Electron 兼容性更好）。
- **范围**：
  1. `useWorkspaceChatStore` reducer
     - `addSession`：确保新会话追加并自动激活。
     - `appendMessages`：验证 messages 追加顺序、不会影响其他 session。
     - `applyCodexEvent`：模拟 `log`/`error`/`exit` 事件，断言 message status/logs 按预期更新。
     - `persist`：mock `localStorage`，序列化到字符串后恢复，确认 `sessions`/`activeSessionId` 保持。
  2. `useWorkspacePreviewStore` reducer
     - `setSelectedDocPath`/`setRightTab` 等操作不会覆盖其他 workspace 的状态。
     - `persist` 后恢复 `rightTab`/`previewTocOpen`。
- **实现建议**：
  - 直接 import store，并在每个测试前调用 `useWorkspaceChatStore.setState({ workspaces: {} })` 复位。
  - 使用 `vi.spyOn(window, 'localStorage', ...)` 或内存 mock。

## 2. Hook 层（React hooks 测试）

- **工具**：`@testing-library/react` + `@testing-library/react-hooks`（或 `@testing-library/react` 的自定义 Hook 渲染器）。
- **对象**：
  1. `usePreviewDocument`
     - 传入含 Markdown 的 `doc`，断言 `html` 被渲染且 `toc` 列表包含正确 heading。
     - `setDoc` with `{ notifyPath: false }` 不触发 `onDocPathChange`。
     - `onTocClick` 调用时触发对应 heading 的 `scrollIntoView`（可用 `jest.fn()` mock DOM 节点方法）。
  2. `useWorkspaceChat(workspaceId)`
     - 渲染 Hook 后不显式调用 `ensure` 也可读取默认 state（自动初始化行为）。
     - 调用 `appendMessages` 后 `sessions` 实时更新。
- **技巧**：
  - 使用 `renderHook(() => useWorkspaceChat('workspace-id'))`；对 store 的各类操作使用 act 包裹。
  - 对 DOM 相关的 hook（如 preview）需要挂一个虚拟 `div` 作为 `previewRef.current`。

## 3. 组件层（UI 单元测试）

- **工具**：`@testing-library/react`.
- **案例**：
  - `RightPanel`
    - 传入 `docPath` + `previewHtml`，断言 tab 切换逻辑、预览内容展示、按钮样式。
    - 切换 tab 时调用 `setRightTab`，确保 store 更新 mock 被触发。
  - `WorkspacePage`
    - mock `useCodexRunner`、`useWorkspaceChat`, `useWorkspacePreview`，验证 props 传入 `WorkspaceLayout`。
    - 模拟 `onDocChange` 回调 -> `setSelectedDocPath` 被调用。
  - `SpecExplorer`
    - mock `fetchFile` / `useFsTreeQuery`，选择文件后预览渲染 + TOC 按钮出现。

为避免 Electron 依赖，可用 Vitest 环境（jsdom）。

## 4. 集成/冒烟测试

- **工具**：Playwright（可针对 web renderer）、或 Spectron/Playwright + Electron。
- **场景**：
  1. 启动 renderer，加载 demo workspace（使用 fixture 项目）。
  2. 在 SpecExplorer 中点选文件，确认右侧预览更新并记住 tab 状态。
  3. 发送一次 mock Codex 请求（或模拟对话输入），验证 messages/右侧日志展示。
  4. 刷新应用（或关闭重开）后，之前的 `rightTab`、`selectedDocPath` 状态仍保持。

## 5. 持续集成

- 在 `pnpm lint`/`pnpm typecheck` 基础上新增 `pnpm test`：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- CI 步骤：`pnpm install --frozen-lockfile && pnpm test && pnpm lint && pnpm typecheck`.

## 6. 落地顺序建议

1. 先搭建 Vitest + RTL 测试环境（配置 tsconfig/vite/vitest）。
2. 编写 store reducer 测试（成本低、收益高）。
3. Hook 层测试（usePreviewDocument、useWorkspaceChat/Preview）。
4. 关键组件测试（RightPanel、SpecExplorer）。
5. 最后评估 UI 自动化（Playwright）投入。

通过上述分层测试策略，可以在不显著拖慢迭代速度的情况下，保障 Workspace 重点路径的正确性，并逐渐覆盖到更广泛的 UI 交互。\*\*\*
