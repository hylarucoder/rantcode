import * as fs from 'node:fs/promises'
import { z } from 'zod'
import { generalSettingsSchema } from '../../shared/orpc/schemas'
import { readGeneral, writeGeneral } from './store'
import { getSettingsPath, getConfigRoot } from '../paths'

export type GeneralSettings = z.infer<typeof generalSettingsSchema>

function getLegacyPath(): string {
  return getSettingsPath('general.settings.json')
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
    await fs.mkdir(getConfigRoot(), { recursive: true })
    await fs.writeFile(file, JSON.stringify(settings, null, 2), 'utf8')
  }
}
