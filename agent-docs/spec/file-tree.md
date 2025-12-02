# 文件树（File Tree）规范

本文档定义 rantcode 中文件树组件的功能规范，包括数据模型、交互行为、API 接口和 UI 约定。

## 概览

文件树是 rantcode 工作区的核心导航组件，用于浏览和操作项目中的文件和目录。

```
┌─────────────────────────────────────────┐
│  📁 docs                                │
│  ├── 📁 design                          │
│  │   ├── 📄 architecture.md        ●    │  ← 当前选中
│  │   ├── 📄 data-model.md               │
│  │   └── 📄 routing.md                  │
│  ├── 📁 spec                            │
│  │   ├── 📄 core-entities.md            │
│  │   └── 📄 file-tree.md           *    │  ← 未保存
│  └── 📁 task                            │
│      ├── 📄 session-enhancements.md     │
│      └── ...                            │
└─────────────────────────────────────────┘
```

## 数据模型

### FsTreeNode

文件树节点的基础数据结构：

```typescript
interface FsTreeNode {
  /** 相对路径（作为唯一标识） */
  path: string
  /** 显示名称（文件名或目录名） */
  name: string
  /** 是否为目录 */
  dir: boolean
  /** 子节点（仅目录有） */
  children?: FsTreeNode[]
}
```

### TreeViewElement（UI 层）

UI 组件使用的节点类型：

```typescript
interface TreeViewElement {
  /** 唯一标识（通常使用 path） */
  id: string
  /** 显示名称 */
  name: string
  /** 是否可选中 */
  isSelectable?: boolean
  /** 子节点 */
  children?: TreeViewElement[]
}
```

### 扩展元数据（计划中）

```typescript
interface FsTreeNodeMeta extends FsTreeNode {
  /** 文件类型（用于图标和行为） */
  type?: 'markdown' | 'typescript' | 'json' | 'yaml' | 'image' | 'unknown'
  /** 文件大小（bytes） */
  size?: number
  /** 最后修改时间 */
  modifiedAt?: number
  /** Git 状态 */
  gitStatus?: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'
  /** 是否有未保存更改 */
  dirty?: boolean
  /** frontmatter 提取的元数据 */
  frontmatter?: {
    title?: string
    status?: string
    priority?: string
  }
}
```

## API 接口

### 文件系统 API

#### fs.tree - 获取目录树

```typescript
interface FsTreeInput {
  /** 基础目录：'repo' | 'docs' | 'vibe-spec' | '' */
  base?: FsBase
  /** 递归深度（默认无限） */
  depth?: number
  /** 项目 ID */
  projectId?: string
}

// 返回
type FsTreeOutput = FsTreeNode
```

#### fs.read - 读取文件内容

```typescript
interface FsReadInput {
  base?: FsBase
  path: string
  projectId?: string
}

interface FsReadOutput {
  path: string
  content: string
}
```

#### fs.write - 写入文件内容（计划中）

```typescript
interface FsWriteInput {
  base?: FsBase
  path: string
  content: string
  projectId?: string
}
```

### React Hooks

```typescript
// 获取文件树
function useFsTree(opts: {
  base?: FsBase
  depth?: number
  projectId?: string
}): {
  data: FsTreeNode | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

// 监听文件变更
function useDocsWatcher(projectId?: string): {
  ready: boolean
  lastEvent: DocsWatcherEvent | null
}
```

## 交互行为

### 基础交互

| 操作 | 行为 |
|------|------|
| 单击文件 | 选中并在预览区打开 |
| 单击目录 | 展开/折叠目录 |
| 双击文件 | 在编辑器中打开（计划中） |
| 右键 | 显示上下文菜单 |

### 上下文菜单（计划中）

**文件操作：**
- 在预览区打开
- 在新标签页打开
- 复制路径
- 复制相对路径
- 重命名
- 删除

**目录操作：**
- 新建文件
- 新建子目录
- 复制路径
- 重命名
- 删除（需确认）

### 键盘导航

| 快捷键 | 行为 |
|--------|------|
| `↑` / `↓` | 上下移动选中项 |
| `←` | 折叠当前目录 / 移动到父目录 |
| `→` | 展开当前目录 / 进入第一个子项 |
| `Enter` | 打开选中文件 |
| `Space` | 展开/折叠目录 |
| `Cmd/Ctrl + F` | 搜索文件（计划中） |

### 拖放操作（计划中）

- 文件/目录可拖动
- 支持拖放到目录进行移动
- 支持拖放到外部应用
- 支持从外部拖入文件

## 视觉规范

### 图标

| 类型 | 图标 | 说明 |
|------|------|------|
| 目录（折叠） | `FolderIcon` | 默认目录图标 |
| 目录（展开） | `FolderOpenIcon` | 展开状态 |
| Markdown | `FileTextIcon` | .md 文件 |
| TypeScript | `FileCodeIcon` | .ts/.tsx 文件 |
| JSON/YAML | `FileJsonIcon` | 配置文件 |
| 图片 | `ImageIcon` | 图片文件 |
| 未知 | `FileIcon` | 默认文件图标 |

### 状态指示

| 状态 | 视觉表示 |
|------|----------|
| 选中 | 背景高亮 `bg-accent/40` |
| 悬停 | 背景淡色 `hover:bg-accent/20` |
| Git 修改 | 文件名右侧显示 `M` 标记（橙色） |
| Git 新增 | 文件名右侧显示 `A` 标记（绿色） |
| Git 删除 | 文件名右侧显示 `D` 标记（红色） |
| 未保存 | 文件名后显示 `*` 或圆点 |

### 缩进与连接线

```
├── item          // 中间项使用 ├
│   ├── nested    // 嵌套使用 │ 作为引导线
│   └── last      // 最后一项使用 └
└── last-item
```

## 性能优化

### 虚拟化

对于大型目录（>1000 个节点），应使用虚拟滚动：

```typescript
// 使用 react-window 或类似库
<VirtualList
  height={containerHeight}
  itemCount={flattenedNodes.length}
  itemSize={24}
  renderItem={({ index }) => <TreeNode node={flattenedNodes[index]} />}
/>
```

### 懒加载

对于深层目录，支持按需加载子节点：

```typescript
interface LazyFsTreeNode extends FsTreeNode {
  /** 子节点是否已加载 */
  childrenLoaded?: boolean
  /** 子节点数量（预览） */
  childCount?: number
}

// 展开目录时加载子节点
async function loadChildren(path: string): Promise<FsTreeNode[]>
```

### 缓存策略

- 已加载的目录结构缓存在内存中
- 文件变更时增量更新，不重新加载整棵树
- 使用 React Query 管理缓存和失效

## 文件监控集成

文件树应与 `DocsWatcher` 集成，实时响应文件变更：

```typescript
useEffect(() => {
  const unsubscribe = api.docs.subscribe({ projectId }, (event) => {
    switch (event.kind) {
      case 'file':
        if (event.changeType === 'add') {
          // 添加新节点
        } else if (event.changeType === 'unlink') {
          // 移除节点
        } else if (event.changeType === 'change') {
          // 更新节点状态
        }
        break
    }
  })
  return unsubscribe
}, [projectId])
```

## 实现状态

### 已实现 ✅

- [x] 基础 Tree 组件（`src/renderer/src/components/ui/file-tree.tsx`）
- [x] 目录展开/折叠
- [x] 文件选中和打开
- [x] fs.tree API 获取目录结构
- [x] fs.read API 读取文件内容
- [x] SpecExplorer 中使用文件树
- [x] 上下文菜单（右键菜单）
  - [x] 打开预览
  - [x] 聊聊这个文件（跳转到聊天并引用文件）
  - [x] 复制路径
  - [x] 复制引用（`@docs/path`）

### 待实现 🚧

- [ ] 键盘导航
- [ ] Git 状态集成
- [ ] 文件类型图标
- [ ] 搜索/过滤
- [ ] 拖放操作
- [ ] 虚拟化大型目录
- [ ] 文件新建/重命名/删除操作
- [ ] 实时文件监控更新
- [ ] 未保存状态指示

## 文件位置

| 组件/模块 | 路径 |
|-----------|------|
| Tree 基础组件 | `src/renderer/src/components/ui/file-tree.tsx` |
| ContextMenu 组件 | `src/renderer/src/components/ui/context-menu.tsx` |
| SpecExplorer | `src/renderer/src/features/spec/components/SpecExplorer.tsx` |
| 文件系统 API | `src/renderer/src/features/spec/api/fs.ts` |
| 类型定义 | `src/shared/types/webui.ts` |
| 文件监控 | `src/main/docsWatcher.ts` |

## 相关文档

- [Docs 模块边界](./docs-boundary.md) - 文件监控和事件推送
- [平台边界](./platform-boundary.md) - 主进程与渲染进程通信
- [oRPC Contract](./orpc-contract.md) - API 接口定义

