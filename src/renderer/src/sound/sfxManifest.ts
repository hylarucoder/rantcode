import type { SfxKey } from '@/sound/soundManager'

// 使用 public 目录中的静态资源路径（相对路径）
// 相对路径在 Electron 的 file:// 协议下能正确解析
export const sfxDefaults: Record<SfxKey, string> = {
  click: './sfx/click.wav',
  success: './sfx/success.wav',
  error: './sfx/error.wav',
  notify: './sfx/notify.wav'
}
