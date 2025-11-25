export type AudioFxKind = 'start' | 'end'

export interface AudioFxSlot {
  enabled: boolean
  src?: string
  name?: string
}

export interface AudioFxConfig {
  enabled: boolean
  start: AudioFxSlot
  end: AudioFxSlot
}

const DEFAULT_CFG: AudioFxConfig = {
  enabled: false,
  start: { enabled: false },
  end: { enabled: false }
}

const LS_KEY = 'rantcode.audioFx'

export function loadAudioFx(): AudioFxConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { ...DEFAULT_CFG }
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_CFG,
      ...(parsed || {}),
      start: { ...DEFAULT_CFG.start, ...(parsed?.start || {}) },
      end: { ...DEFAULT_CFG.end, ...(parsed?.end || {}) }
    } as AudioFxConfig
  } catch {
    return { ...DEFAULT_CFG }
  }
}

export function saveAudioFx(cfg: AudioFxConfig): void {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg))
}

export function playAudioFx(kind: AudioFxKind): void {
  const cfg = loadAudioFx()
  if (!cfg.enabled) return
  const slot = kind === 'start' ? cfg.start : cfg.end
  if (!slot?.enabled || !slot?.src) return
  try {
    const audio = new Audio(slot.src)
    // 默认音量 1.0，可后续扩展 per-slot 音量
    audio.volume = 1
    void audio.play()
  } catch {
    // 忽略播放错误（如用户系统音频被禁）
  }
}

