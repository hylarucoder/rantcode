import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { loadAudioFx, saveAudioFx, type AudioFxConfig } from '@/lib/audioFx'
import { Volume2, Play, Upload, Music } from 'lucide-react'

export default function AudioFxSettings() {
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
      <CardHeader className="pb-4 bg-gradient-to-r from-muted/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
            <Volume2 className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <CardTitle className="text-base">会话音效</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">配置会话开始和结束的提示音</p>
          </div>
        </div>
      </CardHeader>
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
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!field.value}
                        onChange={(e) => {
                          field.onChange(e.target.checked)
                          if (e.target.checked) {
                            const startEnabled = form.getValues('start.enabled')
                            const endEnabled = form.getValues('end.enabled')
                            const s = form.getValues('start.src') as string | undefined
                            const eSrc = form.getValues('end.src') as string | undefined
                            if (startEnabled && s) previewAudio(s)
                            else if (endEnabled && eSrc) previewAudio(eSrc)
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                    </label>
                    <FormLabel className="text-sm font-medium cursor-pointer">
                      启用会话音效
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Start Sound */}
            <SoundSlot
              title="开始音效"
              icon={<Music className="h-4 w-4" />}
              iconBg="bg-green-500/10"
              iconColor="text-green-500"
              form={form}
              fieldPrefix="start"
              fileName={startName}
              canTest={canTestStart}
              onPick={(file) => handlePick('start', file)}
              onTest={() => previewAudio(startSrc)}
            />

            {/* End Sound */}
            <SoundSlot
              title="结束音效"
              icon={<Music className="h-4 w-4" />}
              iconBg="bg-blue-500/10"
              iconColor="text-blue-500"
              form={form}
              fieldPrefix="end"
              fileName={endName}
              canTest={canTestEnd}
              onPick={(file) => handlePick('end', file)}
              onTest={() => previewAudio(endSrc)}
            />
          </div>

          <div className="mt-6 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/50"></span>
              支持 mp3 / wav 格式。启用开关后立即播放当前选择的音效用于确认。
            </p>
          </div>
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
  onTest
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
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!field.value}
                onChange={(e) => {
                  field.onChange(e.target.checked)
                  if (e.target.checked) {
                    const src = form.getValues(`${fieldPrefix}.src`) as string | undefined
                    if (src) previewAudio(src)
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          )}
        />
      </div>

      <div className="space-y-3">
        <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-colors group">
          <Upload className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
            选择音频文件
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
              '未选择文件'
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
            试听
          </Button>
        </div>
      </div>
    </div>
  )
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function previewAudio(src?: string) {
  if (!src) return
  try {
    const a = new Audio(src)
    a.volume = 1
    void a.play()
  } catch {}
}
