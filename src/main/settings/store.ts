import Store from 'electron-store'
import type { z } from 'zod'
import { generalSettingsSchema } from '../../shared/orpc/schemas'

export type GeneralSettings = z.infer<typeof generalSettingsSchema>

type RootSchema = {
  general: GeneralSettings
}

const defaults: RootSchema = {
  general: {
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

let settingsStoreInstance: Store<RootSchema> | null = null

export function getSettingsStore(): Store<RootSchema> {
  if (!settingsStoreInstance) {
    settingsStoreInstance = new Store<RootSchema>({ name: 'settings', defaults })
  }
  return settingsStoreInstance
}

export function readGeneral(): GeneralSettings {
  const raw = getSettingsStore().get('general')
  const result = generalSettingsSchema.safeParse(raw)
  return result.success ? result.data : defaults.general
}

export function writeGeneral(next: GeneralSettings): void {
  getSettingsStore().set('general', next)
}

export function onGeneralChange(
  cb: (newVal: GeneralSettings, oldVal: GeneralSettings | undefined) => void
): () => void {
  const un = getSettingsStore().onDidChange('general', (n, o) => {
    const nn = generalSettingsSchema.safeParse(n)
    const oo = o ? generalSettingsSchema.safeParse(o) : null
    cb(nn.success ? nn.data : defaults.general, oo?.success ? oo.data : undefined)
  })
  return () => un()
}
