---
title: 实现 TTS 语音提醒功能
status: backlog
priority: P2
owner: AI
---

# 实现 TTS 语音提醒功能

## 目标

在 Codex 任务回合完成时提供语音播报，支持本地 Web Speech 和云端 TTS（豆包/Minimax）。

## 设计文档

详见 `docs/spec/tts.md`

## 待办

### Phase 1: 最小可用（v1）

- [ ] Renderer 层：Web Speech 播报（默认开启）
- [ ] Main 进程：`/speech/synthesize` oRPC 路由
- [ ] 适配一个云 TTS（Minimax 或豆包）
- [ ] 触发逻辑：codex exit/error → 读取配置 → 判定 → 合成 → 播放

### Phase 2: 增强（v2）

- [ ] Settings 面板：完整 TTS 配置表单
- [ ] 添加"试听"功能按钮
- [ ] 实现磁盘缓存（`userData/tts-cache/`）
- [ ] 错误回退策略（云 TTS 失败时回退到 Web Speech）
- [ ] 适配第二个云 TTS

### Phase 3: 拓展（v3）

- [ ] 流式 TTS 播放（MediaSource/ReadableStream）
- [ ] 离线 TTS 支持（Piper/Mimic3）
- [ ] 多语言/多音色预设

## 技术要点

### oRPC 路由

```ts
// 路径: /speech/synthesize
type SynthesizeInput = {
  text: string
  engine?: 'web-speech' | 'doubao' | 'minimax'
  voiceId?: string
  rate?: number
  volume?: number
  format?: 'mp3' | 'wav'
  cache?: boolean
}

type SynthesizeOutput =
  | { kind: 'audio'; mime: string; base64: string }
  | { kind: 'noop'; ok: true }
```

### 配置存储

沿用 `providers.json`，新增 `tts` 节点：

```jsonc
{
  "tts": {
    "engine": "web-speech",
    "voiceId": "",
    "rate": 1.0,
    "volume": 1.0,
    "onlyOnFailure": false,
    "minDurationMs": 1000
  }
}
```

## 验收标准

- [ ] 任务完成/失败时能正常播报
- [ ] Web Speech 本地合成可用
- [ ] 至少一个云 TTS 可用
- [ ] Settings 面板可配置 TTS 参数
- [ ] 开关/阈值配置正常工作

