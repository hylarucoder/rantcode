import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Mic, Play, Gauge, Volume2, Clock, AlertCircle } from 'lucide-react'

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
    return DEFAULT_CFG
  }
}

function saveLocal(cfg: TTSConfig): void {
  localStorage.setItem('rantcode.tts', JSON.stringify(cfg))
}

const ENGINE_OPTIONS: { value: Engine; labelKey: string; icon: string; available: boolean }[] = [
  { value: 'off', labelKey: 'settings.tts.engineOff', icon: '🔇', available: true },
  { value: 'web-speech', labelKey: 'settings.tts.engineWebSpeech', icon: '🗣️', available: true },
  { value: 'doubao', labelKey: 'settings.tts.engineDoubao', icon: '☁️', available: false },
  { value: 'minimax', labelKey: 'settings.tts.engineMinimax', icon: '☁️', available: false }
]

export default function TTSSettings() {
  const { t } = useTranslation()
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
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <CardHeader className="pb-4 bg-gradient-to-r from-muted/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10">
            <Mic className="h-5 w-5 text-cyan-500" />
          </div>
          <div>
            <CardTitle className="text-base">{t('settings.tts.title')}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.tts.description')}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <Form form={form}>
          <div className="space-y-6">
            {/* Engine selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Mic className="h-4 w-4 text-muted-foreground" />
                {t('settings.tts.voiceEngine')}
              </div>
              <FormField
                control={form.control}
                name="engine"
                render={({ field }) => (
                  <FormItem>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('settings.tts.selectEngine')} />
                      </SelectTrigger>
                      <SelectContent>
                        {ENGINE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} disabled={!opt.available}>
                            <span className="flex items-center gap-2">
                              <span>{opt.icon}</span>
                              <span>{t(opt.labelKey)}</span>
                              {!opt.available && (
                                <span className="text-xs text-muted-foreground">{t('settings.tts.comingSoon')}</span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            {/* Parameters grid */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                  {t('settings.tts.speed')}
                  <span className="text-xs text-muted-foreground font-normal">(0.5–2.0)</span>
                </div>
                <FormField
                  control={form.control}
                  name="rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0.5}
                            max={2}
                            step={0.1}
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                          />
                          <span className="w-10 text-right text-sm font-mono tabular-nums">
                            {field.value.toFixed(1)}
                          </span>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  {t('settings.tts.volume')}
                  <span className="text-xs text-muted-foreground font-normal">(0–1)</span>
                </div>
                <FormField
                  control={form.control}
                  name="volume"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.1}
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                          />
                          <span className="w-10 text-right text-sm font-mono tabular-nums">
                            {Math.round(field.value * 100)}%
                          </span>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Min duration */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {t('settings.tts.minDuration')}
                <span className="text-xs text-muted-foreground font-normal">{t('settings.tts.milliseconds')}</span>
              </div>
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
                        className="max-w-[200px]"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Failure only + Test button */}
            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              <FormField
                control={form.control}
                name="onlyOnFailure"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                      <FormLabel className="text-sm font-medium cursor-pointer flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        {t('settings.tts.onlyOnFailure')}
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <Button type="button" size="sm" onClick={test} disabled={!canTest} className="gap-2">
                <Play className="h-3.5 w-3.5" />
                {t('common.button.preview')}
              </Button>
            </div>
          </div>
        </Form>

        <div className="mt-6 pt-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/50"></span>
            {t('settings.tts.hint')}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
