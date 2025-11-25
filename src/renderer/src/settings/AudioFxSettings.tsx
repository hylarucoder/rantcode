import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { loadAudioFx, saveAudioFx, type AudioFxConfig } from '@/lib/audioFx'

export default function AudioFxSettings() {
  const form = useForm<AudioFxConfig>({ defaultValues: loadAudioFx() })

  // 全局保存：任意字段变更时持久化
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
    // 立即试听所选文件，提升反馈
    previewAudio(dataUrl)
  }

  return (
    <Card className="border-border/70 p-3 w-full">
      <div className="mb-2 text-sm font-semibold">Sounds · 会话音效</div>
      <Form form={form}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">
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
                      className="mr-2 align-middle"
                    />
                    启用会话音效
                  </FormLabel>
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium">开始音效</div>
            <FormField
              control={form.control}
              name="start.enabled"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">
                    <input
                      type="checkbox"
                      checked={!!field.value}
                      onChange={(e) => {
                        field.onChange(e.target.checked)
                        if (e.target.checked) {
                          const src = form.getValues('start.src') as string | undefined
                          if (src) previewAudio(src)
                        }
                      }}
                      className="mr-2 align-middle"
                    />
                    开启
                  </FormLabel>
                </FormItem>
              )}
            />
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,audio/*"
                onChange={(e) => handlePick('start', e.currentTarget.files?.[0])}
                className="h-8"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{startName ? `已选择: ${startName}` : '未选择文件'}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canTestStart}
                onClick={() => previewAudio(startSrc)}
                className="ml-auto"
              >
                试听
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium">结束音效</div>
            <FormField
              control={form.control}
              name="end.enabled"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">
                    <input
                      type="checkbox"
                      checked={!!field.value}
                      onChange={(e) => {
                        field.onChange(e.target.checked)
                        if (e.target.checked) {
                          const src = form.getValues('end.src') as string | undefined
                          if (src) previewAudio(src)
                        }
                      }}
                      className="mr-2 align-middle"
                    />
                    开启
                  </FormLabel>
                </FormItem>
              )}
            />
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,audio/*"
                onChange={(e) => handlePick('end', e.currentTarget.files?.[0])}
                className="h-8"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{endName ? `已选择: ${endName}` : '未选择文件'}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canTestEnd}
                onClick={() => previewAudio(endSrc)}
                className="ml-auto"
              >
                试听
              </Button>
            </div>
          </div>

          <div className="col-span-2 text-xs text-muted-foreground">
            支持 mp3 / wav。启用开关后立即播放当前选择的音效用于确认。
          </div>
        </div>
      </Form>
    </Card>
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
