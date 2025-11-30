import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Form as UIForm,
  FormField,
  FormItem,
  FormControl,
  FormMessage,
  FormDescription
} from '@/components/ui/form'
import { Save, TestTube2, Pin, PinOff, Sparkles, Terminal, Key, Cpu } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { SettingsCardHeader, SecretInput, TestOutputPanel } from './components'
import { useVendorConfig, useVendorTest } from './hooks'
import { ClaudeVendorConfig, VENDOR_COLORS, VENDOR_LABELS, ENV_KEY_NAMES } from './vendorConfig'

const formSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  modelPrimary: z.string().min(1, 'Primary model is required'),
  modelFast: z.string().optional()
})

type FormValues = z.infer<typeof formSchema>

export default function SingleClaudeVendor({
  id,
  label,
  defaultConfig
}: {
  id: string
  label: string
  defaultConfig: ClaudeVendorConfig
}) {
  const { t } = useTranslation()

  const {
    config,
    updateField,
    saving,
    save,
    tokenValue,
    setTokenValue,
    tokenKey,
    binForSave,
    canPersist,
    vendorOptions
  } = useVendorConfig({ id, label, defaultConfig })

  const { testing, testOutput, testError, testCommand, askWhatModel, canTest } = useVendorTest({
    config,
    binForSave,
    canPersist,
    tokenValue,
    tokenKey,
    onTestComplete: (ok) => {
      updateField('lastTestAt', Date.now())
      updateField('lastTestOk', ok)
    }
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
      token: tokenValue || '',
      modelPrimary: config.modelPrimary || vendorOptions[0] || '',
      modelFast: config.modelFast || ''
    }
  })

  useEffect(() => {
    form.reset({
      token: tokenValue || '',
      modelPrimary: config.modelPrimary || vendorOptions[0] || '',
      modelFast: config.modelFast || ''
    })
  }, [tokenValue, config.modelPrimary, config.modelFast, config.vendorKey])

  const handleSave = async (values: FormValues) => {
    await save(values)
    updateField('modelPrimary', values.modelPrimary)
    updateField('modelFast', values.modelFast || '')
  }

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <SettingsCardHeader
        icon={<Sparkles className="h-5 w-5" />}
        iconClassName={VENDOR_COLORS[config.vendorKey]}
        title={label}
        description={VENDOR_LABELS[config.vendorKey]}
      >
        <Button
          type="button"
          size="sm"
          variant={config.active ? 'default' : 'outline'}
          className="gap-1.5 shrink-0"
          onClick={() => updateField('active', !config.active)}
        >
          {config.active ? (
            <>
              <PinOff className="h-3.5 w-3.5" />
              {t('common.status.enabled')}
            </>
          ) : (
            <>
              <Pin className="h-3.5 w-3.5" />
              {t('common.status.enable')}
            </>
          )}
        </Button>
      </SettingsCardHeader>

      <CardContent className="pt-4">
        <UIForm form={form}>
          {/* Action buttons */}
          <div className="flex gap-2 mb-6 pb-4 border-b border-border/50">
            <Button
              type="submit"
              size="sm"
              className="gap-1.5"
              onClick={form.handleSubmit(handleSave)}
              disabled={saving || !form.formState.isValid}
            >
              {saving ? (
                <>
                  <Spinner />
                  {t('common.status.saving')}
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  {t('settings.vendor.saveConfig')}
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={askWhatModel}
              disabled={testing || !canTest}
            >
              {testing ? (
                <>
                  <Spinner />
                  {t('common.status.testing')}
                </>
              ) : (
                <>
                  <TestTube2 className="h-3.5 w-3.5" />
                  {t('settings.vendor.testConnection')}
                </>
              )}
            </Button>
          </div>

          {/* Basic info grid */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                {t('settings.vendor.displayName')}
              </div>
              <Input
                placeholder={label}
                value={config.displayName || ''}
                onChange={(e) => updateField('displayName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                {t('settings.vendor.executablePath')}
              </div>
              <Input
                value={binForSave}
                disabled
                placeholder={t('settings.vendor.detectingPath')}
                className="bg-muted/30"
              />
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-2 mb-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Key className="h-4 w-4 text-muted-foreground" />
              {t('settings.vendor.apiKey')}{' '}
              <span className="text-red-500">{t('common.label.required')}</span>
            </div>
            <FormField
              control={form.control}
              name="token"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormControl>
                    <SecretInput
                      id={`${id}-token-input`}
                      value={field.value}
                      onChange={(val) => {
                        field.onChange(val)
                        setTokenValue(val)
                      }}
                      placeholder={ENV_KEY_NAMES[tokenKey]}
                    />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                  <FormDescription className="sr-only">Vendor API Key</FormDescription>
                </FormItem>
              )}
            />
          </div>

          {/* Model selection */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                {t('settings.vendor.primaryModel')}{' '}
                <span className="text-red-500">{t('common.label.required')}</span>
              </div>
              <FormField
                control={form.control}
                name="modelPrimary"
                render={({ field, fieldState }) => (
                  <FormItem>
                    {config.vendorKey === 'custom' ? (
                      <Input {...field} />
                    ) : (
                      <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('settings.vendor.selectModel')} />
                        </SelectTrigger>
                        <SelectContent>
                          {vendorOptions.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                  </FormItem>
                )}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                {t('settings.vendor.fastModel')}
                <span className="text-xs text-muted-foreground font-normal">
                  {t('common.label.optional')}
                </span>
              </div>
              <FormField
                control={form.control}
                name="modelFast"
                render={({ field }) => (
                  <FormItem>
                    {config.vendorKey === 'custom' ? (
                      <Input {...field} />
                    ) : (
                      <Select value={field.value || ''} onValueChange={(v) => field.onChange(v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('settings.vendor.selectFastModel')} />
                        </SelectTrigger>
                        <SelectContent>
                          {vendorOptions.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Last test status */}
          {typeof config.lastTestAt === 'number' && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${config.lastTestOk ? 'bg-green-500' : 'bg-red-500'}`}
                />
                {t('settings.vendor.lastTest')}: {new Date(config.lastTestAt).toLocaleString()} ·{' '}
                {config.lastTestOk ? t('common.status.success') : t('common.status.failed')}
              </div>
            </div>
          )}

          {/* Test output */}
          <TestOutputPanel
            testing={testing}
            testCommand={testCommand}
            testOutput={testOutput}
            testError={testError}
          />
        </UIForm>
      </CardContent>
    </Card>
  )
}
