# 语音提醒（TTS）设计与接入说明

本文档描述 Rantcode 的"任务回合完成语音提醒（TTS）"的目标、方案与接口约定，便于后续分阶段实现与扩展（豆包/Minimax 等）。

## 目标与范围

- 在 Codex 任务回合结束时进行语音播报：
  - 成功：提示“执行完成，用时 X 秒”。
  - 失败：提示“执行失败，退出码 N，用时 X 秒”。
- 用户可在设置中自行配置语音引擎与参数：
  - 引擎：本地合成（Web Speech）/ 云端合成（豆包/Minimax 等）。
  - 音色/语速/音量与开关（仅失败播报、最短时长阈值等）。
- 与系统通知（已实现）并行，保证后台可见性与可听性。

## 总体方案

- 双通道提醒：
  - 系统级通知（主进程 Notification）— 已接入。
  - 语音播报（TTS）。
- 分层职责：
  - Renderer：
    - 设置面板（选择引擎/音色/阈值/开关）。
    - 负责播放音频（Audio/WebAudio）或本地合成（Web Speech）。
  - Main：
    - 云 TTS 调用与安全存储密钥（`userData/providers.json`）。
    - 统一 oRPC 路由；可选磁盘缓存（`userData/tts-cache/`）。
- 触发时机：
  - 监听 codex 事件（exit/error），组装播报文案后触发 TTS。

## 配置与存储

- 存放路径：沿用 `providers.json`（已存在），新增 `tts` 节：
  ```jsonc
  {
    "tts": {
      "engine": "web-speech" | "doubao" | "minimax" | "off",
      "voiceId": "string",         // 云引擎的音色/说话人标识（可选）
      "rate": 1.0,                  // 语速，0.5–2.0
      "volume": 1.0,                // 音量，0–1
      "onlyOnFailure": false,       // 仅失败时播报
      "minDurationMs": 1000,        // 仅当用时超过该毫秒数时才播报
      // 云引擎凭证（仅主进程读取）
      "providers": {
        "doubao": { "apiKey": "...", "baseUrl": "..." },
        "minimax": { "apiKey": "...", "baseUrl": "..." }
      }
    }
  }
  ```
- 渲染层只读/写配置（通过已存在的 providers get/set 接口），密钥只在主进程使用。

## oRPC 路由（建议）

- 路径：`/speech/synthesize`
- 输入：
  ```ts
  type SynthesizeInput = {
    text: string
    // 覆盖配置：
    engine?: 'web-speech' | 'doubao' | 'minimax'
    voiceId?: string
    rate?: number
    volume?: number
    format?: 'mp3' | 'wav' // 云引擎建议 mp3
    cache?: boolean // 是否允许磁盘缓存
  }
  ```
- 输出：
  ```ts
  type SynthesizeOutput =
    | { kind: 'audio'; mime: string; base64: string } // 云端返回音频
    | { kind: 'noop'; ok: true } // 本地 Web Speech 由 renderer 自行合成
  ```
- 说明：
  - 当 engine 选择 `web-speech` 时，Main 返回 `{ kind: 'noop' }`，渲染层用 Web Speech 直接合成并播放。
  - 当 engine 为云引擎时，Main 返回 `{ mime, base64 }`，渲染层转 Blob 播放。

## Renderer 播放策略

- Web Speech：
  ```ts
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'
  u.rate = cfg.rate ?? 1.0
  u.volume = cfg.volume ?? 1.0
  speechSynthesis.speak(u)
  ```
- 云音频：
  ```ts
  const buf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([buf], { type: mime })
  const url = URL.createObjectURL(blob)
  new Audio(url).play()
  ```

## Main 侧适配器（云 TTS）

- 统一适配接口：
  ```ts
  interface TTSAdapter {
    synth(
      input: { text: string; voiceId?: string; rate?: number; format?: 'mp3' | 'wav' },
      cfg: { apiKey: string; baseUrl?: string }
    ): Promise<{ mime: string; base64: string }>
  }
  ```
- 参考：
  - 豆包：REST/签名（视最新文档），入参：文本、音色、格式(mp3)；返回音频字节或 base64。
  - Minimax：Bearer Token；入参同上，返回音频/链接（需要二次 GET）。
- 磁盘缓存：
  - 建议 Key = `sha256(engine|voice|rate|text)`，目录 `userData/tts-cache/`。
  - 命中则直接读文件返回，避免重复请求。

## 触发与文案

- 触发点：`codexRunner` 产生的 `exit/error` 事件（已存在）。
- 文案：
  - 成功：`执行完成，用时 {秒.toFixed(1)} 秒`。
  - 失败：`执行失败，退出码 {code}，用时 {秒.toFixed(1)} 秒`。
- 触发前判断：
  - `onlyOnFailure` / `minDurationMs`（小于阈值不播）。

## 错误与回退

- 云 TTS 失败：
  - 记录错误到控制台/日志；
  - 若启用回退，则改用 Web Speech 本地播报；否则静默。
- 无权限/未配置密钥：
  - 设置页标红提示；
  - 接口返回错误（不影响系统通知）。

## 安全与隐私

- 云 TTS 密钥仅存储在主进程 `userData`；渲染层不持久化密钥。
- 仅传输用户确认播报的简短文案，不上传完整日志内容。

## UI 草案（Settings > 语音提醒）

- 启用：开关（Off / On）。
- 引擎：选择（Web Speech / 豆包 / Minimax）。
- 音色：下拉/文本（voiceId）。
- 语速/音量：滑杆。
- 触发策略：仅失败 / 全部；最短时长（ms）。
- 密钥与服务：按引擎显示 `apiKey`/`baseUrl`（主进程保存）。
- 试听：按钮（调用当前配置合成一句“这是试听播报”并播放）。

## 实施计划（分阶段）

- v1（最小可用）
  - 渲染层：Web Speech 播报（默认开，可关）。
  - 主进程：`/speech/synthesize` 路由 + Minimax 或 豆包任一云 TTS 适配。
  - 触发：codex exit/error → 读取配置 → 判定 → 合成 → 播放。
- v2（增强）
  - 设置面板：完整表单与“试听”。
  - 磁盘缓存、错误回退策略。
  - 适配另一个云 TTS（Minimax/豆包都支持）。
- v3（拓展）
  - 流式 TTS 播放（MediaSource/ReadableStream）。
  - 离线 TTS（Piper/Mimic3）。
  - 多语言/多音色预设。

## 与现有功能的关系

- 与系统通知互补：系统通知保证“看得到”，语音提醒保证“听得到”。
- 不影响现有 oRPC、项目/文件系统/Providers 已有路由；配置共用 providers 存储方案。
