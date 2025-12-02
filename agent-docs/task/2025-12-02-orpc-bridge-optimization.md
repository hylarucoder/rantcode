---
title: 优化 oRPC Bridge & Contract 结构
status: partially_completed
priority: P2
---

## 背景

当前 oRPC 方案由三部分组成：

- `src/shared/orpc/contract.ts`：使用 `oc.router` 定义共享 contract，作为前后端的单一类型来源。
- `src/main/orpcBridge.ts`：使用 `os.router` 手工再定义一遍 router 结构，并绑定各个 service handler。
- `src/preload/orpc.ts`：建立 `MessageChannel`，基于 `@orpc/client` 创建 `client`。

整体结构已经比较清晰，但存在一些可以进一步优化的点：

- contract 与 server 端 router 结构双写，容易在演进时产生漂移。
- 错误处理与日志记录在不同 handler 之间不完全统一，label 依赖字符串常量。
- oRPC 消息层日志偏多，可能在高频调用场景下带来不必要的 IO 噪音。
- Notify 通道的 topic/payload 未强类型化，语义依赖调用方约定。

## 目标

- **让 shared contract 成为「唯一真相」**，server 端 router 尽量从 contract 结构派生，减少重复维护。
- **规范错误处理与日志记录**，为关键调用统一打点和广播错误，减少手写字符串与 try/catch。
- **降低无效日志噪音**，只在慢调用或调试场景输出详细 message 级别日志。
- 为 Notify 通道引入基础的类型约束和语义约定，为后续可能的 streaming/subscription 模式铺路。

## 拆解任务

### 1. contract 与 server router 对齐（高优先级）

- 分析 `@orpc/server` / `@orpc/contract` 能力，看是否可以基于 contract 生成 router，或通过一个轻量 wrapper 复用同一棵「路由树」。
- 设计一个 `createRouterFromContract(contract, handlers)` 风格的 helper：
  - contract 仍然在 `src/shared/orpc/contract.ts` 中定义。
  - `src/main/orpcBridge.ts` 只提供 handler 映射（如 `system.health`, `fs.read`, `sessions.appendMessages` 等），不再重复声明 input/output。
- 确保 `setHiddenRouterContract(router, rantcodeContract)` 仍然可用，并验证 devtools / tooling 能正常工作。

### 2. 统一错误处理与 label（中优先级）

- 基于现有 `withErrorHandler` / `withInputErrorHandler`：
  - 将 `providers` / `vendors` / `docs` / `sessions` 等 handler 也迁移到统一包装（避免手写 try/catch）。
  - 封装更语义化的工厂方法，如 `createInputHandler('git.status', gitSvc.status)`。
- 设计一个轻量的 **label 类型约束**：
  - 从 contract/router 结构导出合法的 `"module.method"` 字符串 union 类型，避免随手写错。
  - 或定义统一常量，例如 `RPC_LABELS.sessions.appendMessages`，配合 TS 类型检查使用。

### 3. 调整 oRPC 消息级日志策略（中优先级）

- 审查 `orpcBridge.ts` 中 `orpcLog.info('message handled', { duration_ms: dt })` 的使用频率：
  - 将其降级为 `debug`，或在 `duration_ms > 阈值` 时才打 `info`。
  - 保留 slow-call 诊断能力（例如 `duration_ms > 200ms` 时标记为 `slow: true`）。
- 确认在生产构建中默认日志等级，避免在常规使用中产生大量无价值日志。

### 4. Notify 通道语义与类型增强（低/中优先级）

- 对 `setupOrpc` 中的 `subscribeNotify(topic, handler)` 进行轻微重构：
  - 定义一个 `NotifyTopic` 字面量联合类型（如 `'docs.updated' | 'runner.event' | ...`）。
  - 为每个 topic 定义对应 payload 类型映射（如 `NotifyPayloadMap['docs.updated']`）。
  - 让 `subscribeNotify<'docs.updated'>` 获得强类型 payload，减少 downcast 和魔法字符串。
- 梳理当前 `notifyBridge` 使用的所有 topic，补齐类型定义，并更新调用方。

### 5. schemas 与实现类型的进一步收敛（低优先级）

- 清点 `src/main` 内部直接引用 `../shared/types/webui` 的 RPC 相关类型（如部分 Git / FS 类型）。
- 将这些类型尽可能统一迁移为 `z.infer<typeof xxxSchema>` 的形式，保证：
  - oRPC 输入/输出类型只从 `src/shared/orpc/schemas.ts` 推导。
  - main 实现、preload 和 renderer 三端都共享同一套 schema → type pipeline。
- 对于纯 UI 用的类型（非 RPC 输入/输出）保留在 `types/webui`，避免混淆。

## 验收标准

- 新增或修改任意 oRPC endpoint 时，只需要在 **一处**（shared contract/schemas）变更结构，其它层通过类型提示或编译错误自动暴露遗漏。
- 日志中不再充斥高频 `message handled` 信息，但在需要排查性能时仍然可以通过 debug/slow log 进行分析。
- renderer 在使用 Notify 通道时具备基础的类型约束，常见 topic 与 payload 结构有明确定义。
- 现有功能（文件树、Git、会话、runner 调用等）在 `pnpm dev` / `pnpm build` 下均能正常工作，无新增 TypeScript 或 ESLint 报错。

## 实现情况分析

### ✅ 已完成的优化

#### 1. 调整 oRPC 消息级日志策略（✅ 完成）
- **现状**：在 `orpcBridge.ts` 第 540-544 行已经实现了优化的日志策略
- **实现细节**：
  ```typescript
  if (dt > SLOW_ORPC_THRESHOLD_MS) {
    orpcLog.warn('orpc-message-slow', { durationMs: dt })
  } else {
    orpcLog.debug('orpc-message-handled', { durationMs: dt })
  }
  ```
- **效果**：高频消息使用 debug 级别，慢调用（>200ms）使用 warn 级别，避免了日志噪音

#### 2. Notify 通道语义与类型增强（✅ 完成）
- **现状**：已在 `src/shared/notify.ts` 中实现完整的类型约束
- **实现细节**：
  - 定义了 `NotifyTopic` 字面量联合类型：`'docs' | 'codex' | 'runner.event'`
  - 实现了 `NotifyPayloadMap` 类型映射，为每个 topic 定义强类型 payload
  - 提供了类型安全的 `SubscribeNotifyFn` 和 `NotifyMessage` 接口
- **效果**：Notify 通道具备完整的类型约束，消除了魔法字符串问题

#### 3. 统一错误处理与 label（✅ 大部分完成）
- **现状**：已实现 `withErrorHandler` 和 `withInputErrorHandler` 统一包装器
- **实现细节**：
  - 所有 RPC handler 都使用了统一的错误处理包装器
  - 实现了 `broadcastError` 函数统一广播错误和记录日志
  - 错误日志包含结构化上下文信息（projectId、sessionId 等）
- **不足**：虽然 label 使用字符串常量，但缺乏编译时类型检查约束

### ⚠️ 未完成的优化

#### 1. contract 与 server router 对齐（❌ 未实现）
- **现状**：仍然存在 contract 与 router 双重定义的问题
- **问题**：`src/main/orpcBridge.ts` 第 232-503 行手动定义了完整的 router 结构，与 `src/shared/orpc/contract.ts` 重复
- **影响**：修改 endpoint 需要在两处同时更新，容易产生漂移
- **待实现**：`createRouterFromContract(contract, handlers)` 风格的 helper

#### 2. Label 类型约束（⚠️ 部分完成）
- **现状**：label 使用字符串字面量，缺乏编译时验证
- **问题**：可能存在拼写错误或与 contract 不一致的情况
- **待实现**：从 contract 自动生成合法的 `module.method` 字符串 union 类型

#### 3. schemas 与实现类型收敛（⚠️ 部分完成）
- **现状**：大部分类型已经从 schemas 推导，但可能存在直接引用 `types/webui` 的情况
- **需要进一步检查**：确保所有 RPC 相关类型都统一使用 `z.infer<typeof schema>` 形式

### 📊 完成度评估

- **总体完成度**：约 60%
- **高优先级任务**：20%（contract 对齐未完成）
- **中优先级任务**：80%（日志优化已完成，错误处理基本完成）
- **低优先级任务**：70%（Notify 优化已完成，类型收敛需要进一步检查）

### 🔧 剩余工作建议

1. **优先实现** `createRouterFromContract` helper，解决 contract-router 双重定义问题
2. **添加** 基于 contract 的 label 类型约束
3. **审查** 确保 RPC 类型完全从 schemas 推导

