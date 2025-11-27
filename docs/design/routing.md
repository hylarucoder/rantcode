# 路由设计 (React Router)

> 本文定义 rantcode 渲染层的 URL 路由结构，使应用支持直接跳转、浏览器历史导航、以及未来可能的深度链接分享。

## 1. 路由表

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | `ProjectsPage` | 项目列表首页 |
| `/project/:projectId` | `ProjectPage` | 项目工作区（内部使用 ActivityBar 切换视图）|
| `/settings/*` | `SettingsPage` | 全局设置 |
| `/*` | `NotFound` | 全局 404 |

## 2. 路由层级结构

```tsx
<Routes>
  {/* 全局设置 */}
  <Route path="/settings/*" element={<SettingsPage />} />

  {/* 主应用 */}
  <Route element={<AppShell />}>
    <Route index element={<ProjectsPage />} />
    <Route path="project/:projectId" element={<ProjectPage />} />
    {/* 全局 404 */}
    <Route path="*" element={<NotFound />} />
  </Route>
</Routes>
```

## 3. 设计要点

### 3.1 项目 ID 来自 URL

- 通过 `useParams()` 获取 `projectId`，替代原有的 `useAppStore.activeProjectId` 状态。
- `AppShell` 保留 Titlebar 下拉切换项目的能力，切换时使用 `navigate(`/project/${id}`)` 跳转。

### 3.2 项目内视图切换

项目工作区内部使用 `ActivityBar` 组件进行视图切换，不使用子路由：

| 视图 | ActivityView | 组件 |
|------|--------------|------|
| Sessions | `sessions` | `SessionList` + Chat |
| Docs | `docs` | `SpecExplorer` |
| Assistant | `assistant` | `AssistantPanel` |
| Settings | `settings` | `ProjectSettingsPanel` |

视图状态保存在 React 组件状态中，不反映在 URL。

### 3.3 404 处理

| 层级 | 位置 | 说明 |
|------|------|------|
| 全局 404 | `App.tsx` | 处理所有未匹配的路由 |

- 访问不存在的 projectId 时，`ProjectPage` 会 toast 提示并重定向到 `/`
- 访问不存在的路由时，显示 404 页面，提供返回首页按钮

### 3.4 状态同步

- `activeProjectId` 可以保留在 `useAppStore` 中，用于 Titlebar 高亮显示当前项目。
- 进入 `/project/:projectId` 时，同步更新 `setActiveProjectId(projectId)`。
- 离开 project 回到 `/` 时，可选择清空或保留。

## 4. 未来扩展

如果需要更深的 URL 定位，可以考虑：

- `/project/:projectId?view=docs`：查询参数指定视图
- `/project/:projectId?doc=path/to/file.md`：预览面板默认打开某文档
- `/project/:projectId/sessions/:sessionId`：直接跳转到某个会话

---

> 本设计旨在提供清晰的 URL 语义，同时保持与现有 ActivityBar 状态切换的兼容性。
