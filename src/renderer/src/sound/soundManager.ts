// Minimal Web Audio-based sound manager for built-in UI SFX
// Focused on: lazy AudioContext, master volume/mute, and a few synth presets.

export type SfxKey = 'click' | 'success' | 'error' | 'notify'
type OverrideSlot = { src: string; name?: string }

type SfxState = {
  enabled: boolean
  masterVolume: number // 0..1
  overrides?: Partial<Record<SfxKey, OverrideSlot>>
}

const LS_KEY = 'rantcode.sfx.v1'

function loadState(): SfxState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { enabled: true, masterVolume: 0.8 }
    const parsed = JSON.parse(raw)
    return {
      enabled: typeof parsed?.enabled === 'boolean' ? parsed.enabled : true,
      masterVolume:
        typeof parsed?.masterVolume === 'number' && !Number.isNaN(parsed.masterVolume)
          ? Math.min(1, Math.max(0, parsed.masterVolume))
          : 0.8,
      overrides: parsed?.overrides || {}
    }
  } catch {
    return { enabled: true, masterVolume: 0.8 }
  }
}

function saveState(s: SfxState) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

class SoundManager {
  private _ctx: AudioContext | null = null
  private _master: GainNode | null = null
  private _state: SfxState = loadState()
  private _cache = new Map<string, AudioBuffer>()

  get enabled() {
    return this._state.enabled
  }

  get volume() {
    return this._state.masterVolume
  }

  setEnabled(v: boolean) {
    this._state.enabled = !!v
    saveState(this._state)
  }

  setVolume(v: number) {
    const clamped = Math.min(1, Math.max(0, v))
    this._state.masterVolume = clamped
    if (this._master) {
      const t = this._ctx!.currentTime
      this._master.gain.cancelScheduledValues(t)
      this._master.gain.setTargetAtTime(clamped, t, 0.01)
    }
    saveState(this._state)
  }

  setOverride(key: SfxKey, slot: OverrideSlot | null) {
    const overrides = { ...(this._state.overrides || {}) }
    if (slot) overrides[key] = slot
    else delete overrides[key]
    this._state.overrides = overrides
    saveState(this._state)
  }

  get overrides(): Partial<Record<SfxKey, OverrideSlot>> {
    return this._state.overrides || {}
  }

  /** Ensure AudioContext and master gain exist. */
  private ensure() {
    if (!this._ctx) {
      const Ctor = (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
      this._ctx = new (window.AudioContext || Ctor!)()
    }
    if (!this._master) {
      this._master = this._ctx.createGain()
      this._master.gain.value = this._state.masterVolume
      this._master.connect(this._ctx.destination)
    }
  }

  /** Call on first user gesture to unlock audio (best-effort). */
  async resume() {
    this.ensure()
    if (this._ctx!.state === 'suspended') {
      try {
        await this._ctx!.resume()
      } catch {}
    }
  }

  /** Play SFX by key with priority: user override -> bundled file -> synth fallback. */
  play(key: SfxKey) {
    if (!this._state.enabled) return
    this.ensure()
    const ctx = this._ctx!
    const dest = this._master!

    // Try to get URL from cache, or load defaults and retry
    const tryPlay = () => {
      const url = this.getUrlForKey(key)
      if (url) {
        void this.playUrl(ctx, dest, key, url)
      } else {
        // synth fallback (should rarely happen)
        this.playSynth(key, ctx, dest)
      }
    }

    if (this._sfxDefaults) {
      tryPlay()
    } else {
      // Load defaults first, then play
      void this.loadDefaults().then(tryPlay)
    }
  }

  private _sfxDefaults: Record<SfxKey, string> | null = null

  private getUrlForKey(key: SfxKey): string | null {
    const o = (this._state.overrides || {})[key]?.src
    if (o) return o
    // Use cached defaults or return null (async load will populate later)
    return this._sfxDefaults?.[key] ?? null
  }

  /** Load sfxDefaults asynchronously to avoid require() */
  async loadDefaults(): Promise<void> {
    if (this._sfxDefaults) return
    try {
      const mod = await import('./sfxManifest')
      this._sfxDefaults = mod.sfxDefaults
    } catch {
      // ignore load failures
    }
  }

  private async playUrl(ctx: AudioContext, dest: GainNode, key: SfxKey, url: string) {
    try {
      const cacheKey = `${key}|${url}`
      let buf = this._cache.get(cacheKey)
      if (!buf) {
        const res = await fetch(url)
        const arr = await res.arrayBuffer()
        buf = await ctx.decodeAudioData(arr)
        this._cache.set(cacheKey, buf)
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      const g = ctx.createGain()
      g.gain.value = 1
      src.connect(g)
      g.connect(dest)
      const t = ctx.currentTime
      src.start(t)
    } catch {
      // if failed, fallback to synth
      this.playSynth(key, ctx, dest)
    }
  }

  private playSynth(key: SfxKey, ctx: AudioContext, dest: GainNode) {
    switch (key) {
      case 'click':
        this.playClick(ctx, dest)
        break
      case 'success':
        this.playSuccess(ctx, dest)
        break
      case 'error':
        this.playError(ctx, dest)
        break
      case 'notify':
        this.playNotify(ctx, dest)
        break
    }
  }

  private makeEnv(ctx: AudioContext, duration = 0.1) {
    const g = ctx.createGain()
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(1, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    return { g, startTime: t, endTime: t + duration }
  }

  private playClick(ctx: AudioContext, dest: GainNode) {
    const { g, startTime, endTime } = this.makeEnv(ctx, 0.08)
    g.connect(dest)
    const o = ctx.createOscillator()
    o.type = 'triangle'
    // tiny downward pitch for tactile feel
    o.frequency.setValueAtTime(1600, startTime)
    o.frequency.exponentialRampToValueAtTime(900, endTime)
    o.connect(g)
    o.start(startTime)
    o.stop(endTime)
  }

  private playSuccess(ctx: AudioContext, dest: GainNode) {
    // Two short upward chirps
    const base = ctx.currentTime
    const step = (offset: number, f0: number, f1: number, dur = 0.12) => {
      const { g, startTime } = this.makeEnv(ctx, dur)
      g.connect(dest)
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(f0, startTime + offset)
      o.frequency.exponentialRampToValueAtTime(f1, startTime + offset + dur)
      o.connect(g)
      o.start(base + offset)
      o.stop(base + offset + dur)
    }
    step(0, 660, 880, 0.12)
    step(0.11, 990, 1320, 0.12)
  }

  private playError(ctx: AudioContext, dest: GainNode) {
    // Short dissonant buzz
    const { g, startTime, endTime } = this.makeEnv(ctx, 0.18)
    g.connect(dest)
    const o1 = ctx.createOscillator()
    o1.type = 'square'
    o1.frequency.setValueAtTime(200, startTime)
    o1.frequency.exponentialRampToValueAtTime(140, endTime)
    const o2 = ctx.createOscillator()
    o2.type = 'square'
    o2.frequency.setValueAtTime(300, startTime)
    o2.frequency.exponentialRampToValueAtTime(210, endTime)
    const mix = ctx.createGain()
    mix.gain.value = 0.6
    o1.connect(mix)
    o2.connect(mix)
    mix.connect(g)
    o1.start(startTime)
    o2.start(startTime)
    o1.stop(endTime)
    o2.stop(endTime)
  }

  private playNotify(ctx: AudioContext, dest: GainNode) {
    // Soft ping
    const { g, startTime, endTime } = this.makeEnv(ctx, 0.16)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 4000
    g.connect(dest)
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(1200, startTime)
    o.frequency.linearRampToValueAtTime(1500, endTime)
    o.connect(filter)
    filter.connect(g)
    o.start(startTime)
    o.stop(endTime)
  }
}

export const soundManager = new SoundManager()
