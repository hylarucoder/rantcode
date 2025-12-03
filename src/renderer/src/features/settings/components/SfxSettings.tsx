import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSfx } from '@/shared/hooks/useSfx'
import type { SfxKey } from '@/sound/soundManager'
import { Music2, Play, RotateCcw, Upload, Volume2 } from 'lucide-react'
import { SettingsCardHeader } from './SettingsCardHeader'
import { SettingsHint } from './SettingsHint'
import { RangeSlider, formatPercent } from './RangeSlider'
import { readAsDataURL } from '../lib'

const SFX_ITEMS: { key: SfxKey; labelKey: string; color: string }[] = [
  { key: 'click', labelKey: 'settings.sfx.click', color: 'bg-blue-500' },
  { key: 'success', labelKey: 'settings.sfx.success', color: 'bg-green-500' },
  { key: 'error', labelKey: 'settings.sfx.error', color: 'bg-red-500' },
  { key: 'notify', labelKey: 'settings.sfx.notify', color: 'bg-amber-500' }
]

export default function SfxSettings() {
  const { t } = useTranslation()
  const sfx = useSfx()
  const [enabled, setEnabled] = useState<boolean>(sfx.enabled)
  const [vol, setVol] = useState<number>(sfx.volume)
  const [overrides, setOverrides] = useState<Record<SfxKey, { name?: string }>>(() => {
    const o = sfxOverrides()
    return {
      click: { name: o.click?.name },
      success: { name: o.success?.name },
      error: { name: o.error?.name },
      notify: { name: o.notify?.name }
    }
  })

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <SettingsCardHeader
        icon={<Music2 className="h-5 w-5 text-pink-500" />}
        iconClassName="bg-pink-500/10"
        title={t('settings.sfx.title')}
        description={t('settings.sfx.description')}
      />
      <CardContent className="pt-4">
        {/* Master controls */}
        <div className="mb-6 pb-4 border-b border-border/50 space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={enabled}
              onCheckedChange={(v) => {
                setEnabled(v)
                sfx.setEnabled(v)
              }}
            />
            <span className="text-sm font-medium">{t('settings.sfx.enableUiSounds')}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Volume2 className="h-4 w-4" />
              <span>{t('settings.sfx.volume')}</span>
            </div>
            <RangeSlider
              value={vol}
              onChange={(v) => {
                setVol(v)
                sfx.setVolume(v)
              }}
              min={0}
              max={1}
              step={0.01}
              formatValue={formatPercent}
              className="flex-1"
            />
          </div>
        </div>

        {/* Sound items */}
        <div className="space-y-3">
          {SFX_ITEMS.map((it) => (
            <div
              key={it.key}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-[100px]">
                <span className={`h-2 w-2 rounded-full ${it.color}`}></span>
                <div>
                  <span className="text-sm font-medium">{t(it.labelKey)}</span>
                  <span className="text-xs text-muted-foreground ml-1.5">{it.key}</span>
                </div>
              </div>

              <label className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-colors text-xs text-muted-foreground hover:text-foreground flex-1 min-w-0">
                <Upload className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {overrides[it.key]?.name ? overrides[it.key]?.name : t('common.label.chooseFile')}
                </span>
                <Input
                  type="file"
                  accept="audio/mpeg,audio/wav,audio/x-wav,audio/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.currentTarget.files?.[0]
                    if (!f) return
                    const dataUrl = await readAsDataURL(f)
                    sfx.setOverride(it.key, { src: dataUrl, name: f.name })
                    sfxSetOverride(it.key, { src: dataUrl, name: f.name })
                    setOverrides((o) => ({ ...o, [it.key]: { name: f.name } }))
                    sfx.play(it.key)
                  }}
                />
              </label>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => sfx.play(it.key)}
                  className="h-8 w-8 p-0"
                  title={t('common.button.preview')}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    sfx.setOverride(it.key, null)
                    sfxSetOverride(it.key, null)
                    setOverrides((o) => ({ ...o, [it.key]: { name: undefined } }))
                  }}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  title={t('common.button.reset')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <SettingsHint>{t('settings.sfx.hint')}</SettingsHint>
      </CardContent>
    </Card>
  )
}

function sfxOverrides(): Partial<Record<SfxKey, { src: string; name?: string }>> {
  try {
    const raw = localStorage.getItem('rantcode.sfx.v1')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed?.overrides || {}
  } catch {
    return {}
  }
}

function sfxSetOverride(key: SfxKey, slot: { src: string; name?: string } | null): void {
  try {
    const raw = localStorage.getItem('rantcode.sfx.v1')
    const parsed = raw ? JSON.parse(raw) : { enabled: true, masterVolume: 0.8, overrides: {} }
    const o = parsed.overrides || {}
    if (slot) o[key] = slot
    else delete o[key]
    parsed.overrides = o
    localStorage.setItem('rantcode.sfx.v1', JSON.stringify(parsed))
  } catch {}
}

