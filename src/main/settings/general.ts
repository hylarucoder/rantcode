import { app } from 'electron'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
import { generalSettingsSchema } from '../../shared/orpc/schemas'
import { readGeneral, writeGeneral } from './store'

export type GeneralSettings = z.infer<typeof generalSettingsSchema>

function getLegacyPath(): string {
  const userData = app.getPath('userData')
  return path.join(userData, 'general.settings.json')
}

function defaultGeneral(): GeneralSettings {
  return {
    language: 'zh-CN',
    theme: 'dark',
    zoomFactor: 1,
    trayEnabled: false,
    autoLaunch: false,
    appearance: {
      transparent: false,
      vibrancy: false,
      hardwareAcceleration: true,
      waylandShortcutsPortal: true
    }
  }
}

export async function readGeneralSettings(): Promise<GeneralSettings> {
  // Prefer new electron-store
  try {
    return readGeneral()
  } catch {}
  // Fallback legacy file
  const legacy = getLegacyPath()
  try {
    const raw = await fs.readFile(legacy, 'utf8')
    const parsed = JSON.parse(raw)
    const result = generalSettingsSchema.safeParse(parsed)
    if (result.success) return result.data
  } catch {}
  return defaultGeneral()
}

export async function writeGeneralSettings(settings: GeneralSettings): Promise<void> {
  try {
    writeGeneral(settings)
  } catch {
    // legacy fallback
    const file = getLegacyPath()
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(settings, null, 2), 'utf8')
  }
}
