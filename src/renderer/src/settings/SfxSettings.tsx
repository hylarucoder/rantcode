import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { useSfx } from '@/hooks/useSfx'
import type { SfxKey } from '@/sound/soundManager'
import { Music2, Play, RotateCcw, Upload, Volume2 } from 'lucide-react'

const SFX_ITEMS: { key: SfxKey; label: string; labelEn: string; color: string }[] = [
  { key: 'click', label: '点击', labelEn: 'click', color: 'bg-blue-500' },
  { key: 'success', label: '成功', labelEn: 'success', color: 'bg-green-500' },
  { key: 'error', label: '失败', labelEn: 'error', color: 'bg-red-500' },
  { key: 'notify', label: '提醒', labelEn: 'notify', color: 'bg-amber-500' }
]

export default function SfxSettings() {
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
      <CardHeader className="pb-4 bg-gradient-to-r from-muted/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10">
            <Music2 className="h-5 w-5 text-pink-500" />
          </div>
          <div>
            <CardTitle className="text-base">内置 UI 音效</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">配置界面交互的声音反馈</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Master controls */}
        <div className="mb-6 pb-4 border-b border-border/50 space-y-4">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={enabled}
                onChange={(e) => {
                  const v = e.currentTarget.checked
                  setEnabled(v)
                  sfx.setEnabled(v)
                }}
              />
              <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
            <span className="text-sm font-medium">启用 UI 音效</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Volume2 className="h-4 w-4" />
              <span>音量</span>
            </div>
            <div className="flex-1 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={vol}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value)
                  setVol(v)
                  sfx.setVolume(v)
                }}
                className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
              />
              <span className="w-12 text-right text-sm font-mono tabular-nums text-muted-foreground">
                {Math.round(vol * 100)}%
              </span>
            </div>
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
                  <span className="text-sm font-medium">{it.label}</span>
                  <span className="text-xs text-muted-foreground ml-1.5">{it.labelEn}</span>
                </div>
              </div>

              <label className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-colors text-xs text-muted-foreground hover:text-foreground flex-1 min-w-0">
                <Upload className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {overrides[it.key]?.name ? overrides[it.key]?.name : '选择文件'}
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
                  title="试听"
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
                  title="恢复默认"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/50"></span>
            默认使用内置 WAV
            文件；你也可以为某个键选择自定义音频覆盖。首次用户手势会自动解锁音频上下文。
          </p>
        </div>
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

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
