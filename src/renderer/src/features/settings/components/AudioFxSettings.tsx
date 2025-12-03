import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Form, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { loadAudioFx, saveAudioFx, type AudioFxConfig } from '@/lib/audioFx'
import { Volume2, Play, Upload, Music } from 'lucide-react'
import { SettingsCardHeader } from './SettingsCardHeader'
import { SettingsHint } from './SettingsHint'
import { readAsDataURL, previewAudio } from '../lib'

export default function AudioFxSettings() {
  'use no memo' // react-hook-form's watch() is incompatible with React Compiler memoization
  const { t } = useTranslation()
  const form = useForm<AudioFxConfig>({ defaultValues: loadAudioFx() })

  useEffect(() => {
    const sub = form.watch((value) => saveAudioFx(value as AudioFxConfig))
    return () => sub.unsubscribe?.()
  }, [form])

  const startSrc = useWatch({ control: form.control, name: 'start.src' }) as string | undefined
  const endSrc = useWatch({ control: form.control, name: 'end.src' }) as string | undefined
  const startName = useWatch({ control: form.control, name: 'start.name' }) as string | undefined
  const endName = useWatch({ control: form.control, name: 'end.name' }) as string | undefined
  const canTestStart = !!startSrc
  const canTestEnd = !!endSrc

  const handlePick = async (kind: 'start' | 'end', file: File | null | undefined) => {
    if (!file) return
    const dataUrl = await readAsDataURL(file)
    form.setValue(`${kind}.src` as const, dataUrl, { shouldDirty: true, shouldTouch: true })
    form.setValue(`${kind}.name` as const, file.name, { shouldDirty: true, shouldTouch: true })
    previewAudio(dataUrl)
  }

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <SettingsCardHeader
        icon={<Volume2 className="h-5 w-5 text-orange-500" />}
        iconClassName="bg-orange-500/10"
        title={t('settings.audioFx.title')}
        description={t('settings.audioFx.description')}
      />
      <CardContent className="pt-4">
        <Form form={form}>
          {/* Master toggle */}
          <div className="mb-6 pb-4 border-b border-border/50">
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={!!field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked)
                        if (checked) {
                          const startEnabled = form.getValues('start.enabled')
                          const endEnabled = form.getValues('end.enabled')
                          const s = form.getValues('start.src') as string | undefined
                          const eSrc = form.getValues('end.src') as string | undefined
                          if (startEnabled && s) previewAudio(s)
                          else if (endEnabled && eSrc) previewAudio(eSrc)
                        }
                      }}
                    />
                    <FormLabel className="text-sm font-medium cursor-pointer">
                      {t('settings.audioFx.enableSessionSounds')}
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Start Sound */}
            <SoundSlot
              title={t('settings.audioFx.startSound')}
              icon={<Music className="h-4 w-4" />}
              iconBg="bg-green-500/10"
              iconColor="text-green-500"
              form={form}
              fieldPrefix="start"
              fileName={startName}
              canTest={canTestStart}
              onPick={(file) => handlePick('start', file)}
              onTest={() => previewAudio(startSrc)}
              t={t}
            />

            {/* End Sound */}
            <SoundSlot
              title={t('settings.audioFx.endSound')}
              icon={<Music className="h-4 w-4" />}
              iconBg="bg-blue-500/10"
              iconColor="text-blue-500"
              form={form}
              fieldPrefix="end"
              fileName={endName}
              canTest={canTestEnd}
              onPick={(file) => handlePick('end', file)}
              onTest={() => previewAudio(endSrc)}
              t={t}
            />
          </div>

          <SettingsHint>{t('settings.audioFx.hint')}</SettingsHint>
        </Form>
      </CardContent>
    </Card>
  )
}

function SoundSlot({
  title,
  icon,
  iconBg,
  iconColor,
  form,
  fieldPrefix,
  fileName,
  canTest,
  onPick,
  onTest,
  t
}: {
  title: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  form: ReturnType<typeof useForm<AudioFxConfig>>
  fieldPrefix: 'start' | 'end'
  fileName?: string
  canTest: boolean
  onPick: (file: File | null | undefined) => void
  onTest: () => void
  t: (key: string) => string
}) {
  return (
    <div className="rounded-lg border border-border/50 p-4 bg-muted/20 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}>
            <span className={iconColor}>{icon}</span>
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <FormField
          control={form.control}
          name={`${fieldPrefix}.enabled`}
          render={({ field }) => (
            <Switch
              checked={!!field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked)
                if (checked) {
                  const src = form.getValues(`${fieldPrefix}.src`) as string | undefined
                  if (src) previewAudio(src)
                }
              }}
              className="h-5 w-9 [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
            />
          )}
        />
      </div>

      <div className="space-y-3">
        <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-colors group">
          <Upload className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
            {t('settings.audioFx.chooseAudioFile')}
          </span>
          <Input
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/*"
            onChange={(e) => onPick(e.currentTarget.files?.[0])}
            className="hidden"
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground truncate flex-1">
            {fileName ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500"></span>
                {fileName}
              </span>
            ) : (
              t('common.label.noFileSelected')
            )}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canTest}
            onClick={onTest}
            className="gap-1.5 shrink-0"
          >
            <Play className="h-3 w-3" />
            {t('common.button.preview')}
          </Button>
        </div>
      </div>
    </div>
  )
}

