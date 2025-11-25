import { useCallback, useEffect, useRef } from 'react'
import { soundManager, type SfxKey } from '@/sound/soundManager'

export function useSfx() {
  const resumedRef = useRef(false)

  useEffect(() => {
    const onFirstUserGesture = async () => {
      if (resumedRef.current) return
      resumedRef.current = true
      await soundManager.resume()
    }
    // Best-effort unlock on several common events
    document.addEventListener('pointerdown', onFirstUserGesture, { once: true })
    document.addEventListener('keydown', onFirstUserGesture, { once: true })
    return () => {
      document.removeEventListener('pointerdown', onFirstUserGesture)
      document.removeEventListener('keydown', onFirstUserGesture)
    }
  }, [])

  const play = useCallback((key: SfxKey) => soundManager.play(key), [])
  return {
    play,
    setEnabled: (v: boolean) => soundManager.setEnabled(v),
    setVolume: (v: number) => soundManager.setVolume(v),
    setOverride: (key: SfxKey, slot: { src: string; name?: string } | null) =>
      soundManager.setOverride(key, slot),
    get enabled() {
      return soundManager.enabled
    },
    get volume() {
      return soundManager.volume
    },
    get overrides() {
      return soundManager.overrides
    }
  }
}
