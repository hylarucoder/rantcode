import type { SfxKey } from '@/sound/soundManager'

export const sfxDefaults: Record<SfxKey, string> = {
  click: new URL('../assets/sfx/click.wav', import.meta.url).toString(),
  success: new URL('../assets/sfx/success.wav', import.meta.url).toString(),
  error: new URL('../assets/sfx/error.wav', import.meta.url).toString(),
  notify: new URL('../assets/sfx/notify.wav', import.meta.url).toString()
}

