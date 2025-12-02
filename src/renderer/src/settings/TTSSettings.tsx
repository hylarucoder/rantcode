import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
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
import {
  SettingsCardHeader,
  SettingsHint,
  RangeSlider,
  formatPercent,
  formatDecimal
} from './components'

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
  'use no memo' // react-hook-form's watch() is incompatible with React Compiler memoization
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
      <SettingsCardHeader
        icon={<Mic className="h-5 w-5 text-cyan-500" />}
        iconClassName="bg-cyan-500/10"
        title={t('settings.tts.title')}
        description={t('settings.tts.description')}
      />
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
                                <span className="text-xs text-muted-foreground">
                                  {t('settings.tts.comingSoon')}
                                </span>
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
                        <RangeSlider
                          value={field.value}
                          onChange={field.onChange}
                          min={0.5}
                          max={2}
                          step={0.1}
                          formatValue={formatDecimal}
                        />
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
                        <RangeSlider
                          value={field.value}
                          onChange={field.onChange}
                          min={0}
                          max={1}
                          step={0.1}
                          formatValue={formatPercent}
                        />
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
                <span className="text-xs text-muted-foreground font-normal">
                  {t('settings.tts.milliseconds')}
                </span>
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
                      <Switch checked={!!field.value} onCheckedChange={field.onChange} />
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

        <SettingsHint>{t('settings.tts.hint')}</SettingsHint>
      </CardContent>
    </Card>
  )
}
