# Spec 文档

本目录包含接口规范、模块边界定义和行为规格说明。

## 核心规范

| 文档 | 说明 |
|------|------|
| [core-entities.md](./core-entities.md) | 核心实体规范（Agent/Session/Message） |
| [orpc-contract.md](./orpc-contract.md) | oRPC 合约声明与用法 |

## 模块边界

| 文档 | 说明 |
|------|------|
| [platform-boundary.md](./platform-boundary.md) | 平台边界（Preload/oRPC/Settings/Notify） |
| [agents-boundary.md](./agents-boundary.md) | Agents 模块边界（window.api.agents） |
| [docs-boundary.md](./docs-boundary.md) | Docs 模块边界（window.api.docs） |
| [security.md](./security.md) | 安全规范（Electron/Markdown/IPC） |

## 格式与协议

| 文档 | 说明 |
|------|------|
| [conversation-log.md](./conversation-log.md) | conversation.log 格式与渲染规范 |

## 功能规格

| 文档 | 说明 |
|------|------|
| [tts.md](./tts.md) | TTS 语音提醒设计 |

## 规范原则

- **边界清晰**：每个模块职责明确，接口最小化
- **类型契约**：输入输出通过 Zod Schema 验证
- **安全优先**：渲染层不直接访问特权 API
