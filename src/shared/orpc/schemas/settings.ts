import { z } from 'zod'

// App-level general settings (UI prefs; non-sensitive)
export const generalSettingsSchema = z.object({
  language: z.union([z.literal('zh-CN'), z.literal('en-US')]).default('zh-CN'),
  theme: z.union([z.literal('light'), z.literal('dark')]).default('dark'),
  zoomFactor: z.number().min(0.5).max(3).default(1),
  trayEnabled: z.boolean().default(false),
  autoLaunch: z.boolean().default(false),
  appearance: z
    .object({
      transparent: z.boolean().default(false),
      vibrancy: z.union([z.boolean(), z.string()]).default(false),
      hardwareAcceleration: z.boolean().default(true),
      waylandShortcutsPortal: z.boolean().default(true)
    })
    .default({
      transparent: false,
      vibrancy: false,
      hardwareAcceleration: true,
      waylandShortcutsPortal: true
    })
})

// ============================================================================
// Inferred Types
// ============================================================================

/** 通用设置 */
export type GeneralSettings = z.infer<typeof generalSettingsSchema>

