/**
 * Audio utilities for settings components
 */

/**
 * Read file as data URL
 */
export function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Preview audio from data URL or path
 */
export function previewAudio(src?: string, volume = 1): void {
  if (!src) return
  try {
    const audio = new Audio(src)
    audio.volume = volume
    void audio.play()
  } catch {
    // Silently ignore playback errors
  }
}
