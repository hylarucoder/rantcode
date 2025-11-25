import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Card } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Engine = 'off' | 'web-speech' | 'doubao' | 'minimax'

interface TTSConfig {
  engine: Engine
  rate: number
  volume: number
  onlyOnFailure: boolean
  minDurationMs: number
}

const DEFAULT_CFG: TTSConfig = {
  engine: 'web-speech',
  rate: 1.0,
  volume: 1.0,
  onlyOnFailure: false,
  minDurationMs: 1000
}

function loadLocal(): TTSConfig {
  const raw = localStorage.getItem('rantcode.tts')
  if (!raw) return DEFAULT_CFG
  try {
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CFG, ...(parsed || {}) } as TTSConfig
  } catch {
    // Invalid JSON → fallback to defaults
    return DEFAULT_CFG
  }
}

function saveLocal(cfg: TTSConfig): void {
  localStorage.setItem('rantcode.tts', JSON.stringify(cfg))
}

export default function TTSSettings() {
  const form = useForm<TTSConfig>({ defaultValues: loadLocal() })
  useEffect(() => {
    const sub = form.watch((value) => saveLocal(value as TTSConfig))
    return () => sub.unsubscribe?.()
  }, [form])

  const engine = useWatch({ control: form.control, name: 'engine' }) as Engine
  const canTest = useMemo(
    () => engine === 'web-speech' && typeof speechSynthesis !== 'undefined',
    [engine]
  )

  const test = () => {
    const v = form.getValues()
    if (v.engine !== 'web-speech') return
    const u = new SpeechSynthesisUtterance('这是试听播报')
    u.lang = 'zh-CN'
    u.rate = v.rate
    u.volume = v.volume
    speechSynthesis.speak(u)
  }

  return (
    <Card className="flex flex-col gap-2 p-2">
      <div className="text-sm font-semibold">语音提醒</div>
      <Form form={form}>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">引擎</div>
            <FormField
              control={form.control}
              name="engine"
              render={({ field }) => (
                <FormItem>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="选择语音引擎" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">关闭</SelectItem>
                      <SelectItem value="web-speech">本地合成（Web Speech）</SelectItem>
                      <SelectItem value="doubao">豆包（云）</SelectItem>
                      <SelectItem value="minimax">Minimax（云）</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">语速（0.5–2.0）</div>
            <FormField
              control={form.control}
              name="rate"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min={0.5}
                      max={2}
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value) || 1)}
                      className="h-8"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">音量（0–1）</div>
            <FormField
              control={form.control}
              name="volume"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={1}
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value) || 1)}
                      className="h-8"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">最短播报时长（毫秒）</div>
            <FormField
              control={form.control}
              name="minDurationMs"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="number"
                      step="100"
                      min={0}
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                      className="h-8"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <FormField
              control={form.control}
              name="onlyOnFailure"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">
                    <input
                      type="checkbox"
                      checked={!!field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      className="mr-2 align-middle"
                    />
                    仅失败时播报
                  </FormLabel>
                </FormItem>
              )}
            />
            <Button type="button" size="sm" className="ml-auto" onClick={test} disabled={!canTest}>
              试听
            </Button>
          </div>
        </div>
      </Form>
      <div className="text-xs text-muted-foreground">
        提示：云端语音合成将在后续版本接入（豆包/Minimax）。当前使用本地 Web Speech 作为基础播报与试听。
      </div>
    </Card>
  )
}
