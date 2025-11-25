import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { useSfx } from '@/hooks/useSfx'
import type { SfxKey } from '@/sound/soundManager'

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
    <Card className="border-border/70 p-3 w-full">
      <div className="mb-2 text-sm font-semibold">Sounds · 内置 UI 音效</div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="col-span-2 flex items-center gap-3">
          <label className="text-sm">
            <input
              type="checkbox"
              className="mr-2 align-middle"
              checked={enabled}
              onChange={(e) => {
                const v = e.currentTarget.checked
                setEnabled(v)
                sfx.setEnabled(v)
              }}
            />
            启用 UI 音效
          </label>
        </div>

        <div className="col-span-2 flex items-center gap-3">
          <div className="text-xs">音量</div>
          <Input
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
            className="h-2 flex-1"
          />
          <div className="w-10 text-right text-xs tabular-nums">{Math.round(vol * 100)}%</div>
        </div>

        <div className="col-span-2 grid grid-cols-1 gap-3">
          {([
            { key: 'click', label: '点击 click' },
            { key: 'success', label: '成功 success' },
            { key: 'error', label: '失败 error' },
            { key: 'notify', label: '提醒 notify' }
          ] as { key: SfxKey; label: string }[]).map((it) => (
            <div key={it.key} className="flex items-center gap-2">
              <div className="w-28 text-xs">{it.label}</div>
              <Input
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,audio/*"
                className="h-8"
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
              <div className="text-xs text-muted-foreground truncate flex-1">
                {overrides[it.key]?.name ? `已覆盖: ${overrides[it.key]?.name}` : '使用内置'}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => sfx.play(it.key)}
              >
                试听
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
              >
                恢复默认
              </Button>
            </div>
          ))}
        </div>

        <div className="col-span-2 text-xs text-muted-foreground">
          默认使用内置 WAV 文件；你也可以为某个键选择自定义音频覆盖。首次用户手势会自动解锁音频上下文。
        </div>
      </div>
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

function sfxSetOverride(
  key: SfxKey,
  slot: { src: string; name?: string } | null
): void {
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
