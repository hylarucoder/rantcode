# React 渲染稳定性与自激回路防护指南

面向本项目（Electron + React + Radix/Panel 等三方组件）的稳定渲染规范，目标是系统性地避免以下问题：

- Maximum update depth exceeded（组件反复 setState 触发无限渲染）。
- 列表子项 key 不稳定导致重挂载、ref 循环与副作用抖动。
- 受控与非受控混用、onChange 颠簸造成的正反馈。

本文提供问题抽象、通用约束、落地范式与评审清单。

## 核心抽象：三类触发器

- 不稳定引用：ref/handler/props 每次 render 都变，第三方组件在 setRef/onProps 里 setState，形成“渲染 → setState → 再渲染”。
- 受控值颠簸：传了 `value` 又用 `defaultValue`，或 `onValueChange` 每次都返回新数组/对象，导致子组件持续认为“值变化”。
- 列表重挂载：key 缺失或不稳定，子项副作用（effect/ref）在每次 mount/unmount 间反复触发。

## 通用约束（必须遵守）

1. 列表 key

- 只保留一层 key（由列表容器负责），子项内部不再带 key。
- key 必须稳定且业务唯一：优先使用 `id`；禁止使用 `index` 或易变组合。

2. Refs 与回调

- 禁止在 callback ref 中 `setState`，需要节点请使用对象 ref：`const r = useRef<El|null>(null)`。
- 如必须使用 callback ref，用 `useCallback` 稳定化，且内部不做状态写入。
- 不在 `map` 的子项上绑定带有 `setState` 的 callback ref。

3. 受控组件

- 只使用受控模式：`value + onValueChange`；移除 `defaultValue`。
- `onValueChange` 仅在“值真的变化”时写回；数组/对象建议做浅比较后再 `setState`。
- 不要叠加额外手动切换（例如 Radix Accordion 的 Trigger 再 `onClick` 自己改状态）。

4. Effect 与依赖

- `useEffect/useLayoutEffect` 的依赖只放稳定引用；内联对象/函数必须经 `useMemo/useCallback` 稳定化。
- effect 内 `setState` 前做“相等不更新”守卫：值未变立即 `return`。
- 按需使用取消标记（`cancelled`）处理异步，避免卸载后写状态。

5. 滚动与自动滚底

- 使用 stick-to-bottom 布尔：仅在为 `true` 时执行滚动；程序化滚动可加一个“编程滚动标记”短路 onScroll 的反向 setState。
- onScroll 回调仅更新必要的布尔/数值，避免级联影响父组件树。

6. 属性与重渲染

- 避免向第三方根组件传入每次 render 都变化的内联对象（如 `style`、`items` 新建数组）。必要时 `useMemo`。
- 对明显静态的子树使用 `React.memo` 包裹，减少受上层状态波及。

## 项目内范式与示例

1. 消息列表（MessageList）

- 容器负责 key：`{messages.map(m => <div key={m.id}>{renderMessage(m)}</div>)}`。
- 子项组件（如 `AgentMessageBubble`）仅根据必要字段触发副作用：
  - Markdown 渲染依赖 `[trimmedOutput, themeMode]`；
  - 滚动依赖 `[logs.length, tab]`；
  - 不依赖可变对象/函数。

2. Radix Accordion（文件树）

- 受控用法：

```tsx
<Accordion.Root
  type="multiple"
  value={expandedItems}
  onValueChange={(v) => {
    if (!shallowEqualArray(v, expandedItems)) setExpandedItems(v)
  }}
>
  {/* Trigger 不再手动 onClick 切换 */}
</Accordion.Root>
```

- 不混用 `defaultValue`；不要在 Trigger 上再 `onClick` 去改同一份状态。

3. 自动滚底（抽象约定）

- Hook 合约：`useAutoScrollBottom(ref, enabled, deps)` 中 `enabled` 由“是否需要贴底”布尔控制；
- onScroll 里只更新“是否贴底”，不要做其它写状态。

## 评审清单（Code Review）

- 列表：是否只有一层稳定 key？子项里有没有副作用？
- Refs：是否存在 callback ref 里 setState？是否在 map 子项上使用了 callback ref？
- 受控值：`value` 是否与 `defaultValue` 混用？`onChange` 是否总返回新数组/对象？
- Effect：依赖项是否稳定？是否有“相等不更新”守卫？
- 滚动：是否可能出现滚动→onScroll→setState→滚动的环？
- 第三方组件：是否传了内联对象/函数导致持续重渲染？

## 调试与定位建议

- 浏览器中 Pretty print 报错的 bundle，搜索 `setRef`，向上查看调用点，多数能定位到具体组件。
- 二分禁用法：从页面布局切块禁用 Panel/模块，快速缩小问题范围。
- 临时在关键 `setState` 处 `console.trace`，检查是否由 ref/受控变更触发。
- 使用 React Profiler 观察提交瀑布，识别“持续提交”的组件。

## 与本项目相关的已知踩坑与修复

- 文件树：混用 `defaultValue` 与受控 `value`，且 `onValueChange` 每次 append 导致状态不断增长；改为纯受控 `value` + 直接 `setExpandedItems(value)`，并移除 Trigger 的手动切换。
- 消息列表：缺少稳定 key 导致子项重挂载，子项副作用抖动；由容器统一提供 `key={m.id}`。

## 推荐工具方法

```ts
// 浅比较数组，避免无意义 setState
export function shallowEqualArray<T>(a?: T[], b?: T[]) {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
```

在受控组件的 `onValueChange` 中使用此函数，可显著降低颠簸。

---

请在新增组件时对照本指南；如需引入新的第三方 UI 组件，务必验证其受控/非受控行为，确保不会与我们的模式相冲突。
