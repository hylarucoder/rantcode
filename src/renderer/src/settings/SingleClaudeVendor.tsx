import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { Save, TestTube2, Pin, PinOff, Eye, EyeOff, Sparkles, Terminal, Key, Cpu } from 'lucide-react'
import { useClaudeVendorsQuery, useSetClaudeVendorsMutation } from '@/features/settings'
import { useRunClaudePromptMutation } from '@/features/settings/api/hooks'
import {
  useAgentsInfoQuery,
  useClaudeTokensQuery,
  useSetClaudeTokensMutation
} from '@/features/settings/api/agentsHooks'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

type VendorKey = 'anthropic' | 'kimi' | 'glm' | 'minmax' | 'custom'

type ClaudeVendorConfig = {
  id: string
  displayName?: string
  vendorKey: VendorKey
  binPath: string
  args?: string[]
  promptMode?: 'stdin' | 'arg'
  promptTemplate?: string
  envVars?: Record<string, string>
  modelPrimary?: string
  modelFast?: string
  active?: boolean
  lastTestAt?: number
  lastTestOk?: boolean
}

type Catalog = Record<string, ClaudeVendorConfig>

export default function SingleClaudeVendor({
  id,
  label,
  defaultConfig
}: {
  id: string
  label: string
  defaultConfig: ClaudeVendorConfig
}) {
  const vendorsQuery = useClaudeVendorsQuery()
  const setVendors = useSetClaudeVendorsMutation()
  const runPromptMutation = useRunClaudePromptMutation()

  const [config, setConfig] = useState<ClaudeVendorConfig>(defaultConfig)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testOutput, setTestOutput] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testCommand, setTestCommand] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    if (testCommand) {
      console.log('[Claude run] Command:', testCommand)
    }
  }, [testCommand])

  const infoQuery = useAgentsInfoQuery()
  const executablePath = (
    infoQuery.data as { claudeCode?: { executablePath?: string } } | undefined
  )?.claudeCode?.executablePath as string | undefined

  const tokensQuery = useClaudeTokensQuery()
  const setTokens = useSetClaudeTokensMutation()
  const tokens = (tokensQuery.data || {}) as Partial<
    Record<'official' | 'kimi' | 'glm' | 'minmax', string>
  >
  const [tokenValue, setTokenValue] = useState<string>('')

  useEffect(() => {
    const catalog = (vendorsQuery.data as Catalog) || {}
    const fromStore = catalog[id]
    if (fromStore) setConfig(fromStore)
  }, [vendorsQuery.data, id])

  const updateField = <K extends keyof ClaudeVendorConfig>(
    key: K,
    value: ClaudeVendorConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const binForSave = useMemo(
    () => config.binPath || executablePath || '',
    [config.binPath, executablePath]
  )
  const canPersist = useMemo(() => !!binForSave && binForSave.trim().length > 0, [binForSave])

  const tokenKey: 'official' | 'kimi' | 'glm' | 'minmax' =
    config.vendorKey === 'kimi'
      ? 'kimi'
      : config.vendorKey === 'glm'
        ? 'glm'
        : config.vendorKey === 'minmax'
          ? 'minmax'
          : 'official'

  useEffect(() => {
    setTokenValue((tokens[tokenKey] as string) || '')
  }, [tokensQuery.data, tokenKey, tokens])

  const save = async (values?: { token: string; modelPrimary: string; modelFast?: string }) => {
    const catalog = (vendorsQuery.data as Catalog) || {}
    try {
      setSaving(true)
      const nextTokenVal = (values?.token ?? tokenValue) || ''
      const nextTokens = { ...tokens, [tokenKey]: nextTokenVal }
      await setTokens.mutateAsync(nextTokens)
      if (canPersist) {
        const nextCfg: ClaudeVendorConfig = {
          ...config,
          id,
          binPath: binForSave,
          displayName: config.displayName || label,
          modelPrimary: values?.modelPrimary ?? config.modelPrimary,
          modelFast: values?.modelFast ?? config.modelFast
        }
        const next: Catalog = { ...catalog, [id]: nextCfg }
        await setVendors.mutateAsync(next)
      }
    } finally {
      setSaving(false)
    }
  }

  const askWhatModel = async () => {
    if (!canPersist) return
    if (!tokenValue || tokenValue.trim().length === 0) return
    try {
      setTesting(true)
      setTestOutput(null)
      setTestError(null)
      const envKey =
        tokenKey === 'kimi'
          ? 'KIMI_API_KEY'
          : tokenKey === 'glm'
            ? 'ZHIPU_API_KEY'
            : tokenKey === 'minmax'
              ? 'MINMAX_API_KEY'
              : 'ANTHROPIC_API_KEY'
      const res = (await runPromptMutation.mutateAsync({
        config: {
          ...config,
          binPath: binForSave,
          promptMode: 'arg',
          envVars: { ...(config.envVars || {}), [envKey]: tokenValue }
        },
        prompt: '你是什么大模型'
      })) as { ok: boolean; error?: string; output?: string; command?: string }
      const stamp = Date.now()
      setConfig((prev) => ({ ...prev, lastTestAt: stamp, lastTestOk: !!res?.ok }))
      setTestOutput(res.output || '')
      setTestError(res.ok ? null : res.error || null)
      setTestCommand(res.command || null)
    } finally {
      setTesting(false)
    }
  }

  const MODEL_OPTIONS: Record<VendorKey, string[]> = {
    anthropic: ['claude-3-5-sonnet-latest', 'claude-3-haiku-latest'],
    kimi: [
      'kimi-k2-preview',
      'kimi-k2-turbo-preview',
      'kimi-k2-thinking',
      'kimi-k2-thinking-turbo'
    ],
    glm: ['GLM-4.6'],
    minmax: ['MiniMax-M2'],
    custom: []
  }
  const vendorOptions = MODEL_OPTIONS[config.vendorKey] || []

  const formSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    modelPrimary: z.string().min(1, 'Primary model is required'),
    modelFast: z.string().optional()
  })

  const form = useForm<z.infer<typeof formSchema>>({
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

  const vendorColor = {
    kimi: 'text-blue-500 bg-blue-500/10',
    glm: 'text-green-500 bg-green-500/10',
    minmax: 'text-purple-500 bg-purple-500/10',
    anthropic: 'text-orange-500 bg-orange-500/10',
    custom: 'text-gray-500 bg-gray-500/10'
  }

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-muted/50 to-transparent">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${vendorColor[config.vendorKey]}`}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{label}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {config.vendorKey === 'kimi'
                ? 'Moonshot AI'
                : config.vendorKey === 'glm'
                  ? '智谱 AI'
                  : config.vendorKey === 'minmax'
                    ? 'Minimax AI'
                    : 'Anthropic'}
            </p>
          </div>
        </div>
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
              已启用
            </>
          ) : (
            <>
              <Pin className="h-3.5 w-3.5" />
              启用
            </>
          )}
        </Button>
      </div>
      <CardContent className="pt-4">
        <UIForm form={form}>
          {/* Action buttons */}
          <div className="flex gap-2 mb-6 pb-4 border-b border-border/50">
            <Button
              type="submit"
              size="sm"
              className="gap-1.5"
              onClick={form.handleSubmit(async (values) => {
                await save(values)
                updateField('modelPrimary', values.modelPrimary)
                updateField('modelFast', values.modelFast || '')
              })}
              disabled={saving || !form.formState.isValid}
            >
              {saving ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  保存中…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  保存配置
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={askWhatModel}
              disabled={testing || !canPersist || !tokenValue || tokenValue.trim().length === 0}
            >
              {testing ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  测试中…
                </>
              ) : (
                <>
                  <TestTube2 className="h-3.5 w-3.5" />
                  测试连接
                </>
              )}
            </Button>
          </div>

          {/* Basic info grid */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                显示名称
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
                可执行路径
              </div>
              <Input
                value={binForSave}
                disabled
                placeholder="Detecting claude/claude-code…"
                className="bg-muted/30"
              />
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-2 mb-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Key className="h-4 w-4 text-muted-foreground" />
              API Key <span className="text-red-500">*</span>
            </div>
            <FormField
              control={form.control}
              name="token"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        id={`${id}-token-input`}
                        type={showApiKey ? 'text' : 'password'}
                        className="pr-10"
                        placeholder={
                          tokenKey === 'kimi'
                            ? 'KIMI_API_KEY'
                            : tokenKey === 'glm'
                              ? 'ZHIPU_API_KEY'
                              : tokenKey === 'minmax'
                                ? 'MINMAX_API_KEY'
                                : 'ANTHROPIC_API_KEY'
                        }
                        onChange={(e) => {
                          field.onChange(e)
                          setTokenValue(e.target.value)
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowApiKey((v) => !v)}
                        aria-label={showApiKey ? 'Hide API Key' : 'Show API Key'}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </FormControl>
                  {fieldState.error && (
                    <FormMessage>{fieldState.error.message}</FormMessage>
                  )}
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
                主要模型 <span className="text-red-500">*</span>
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
                          <SelectValue placeholder="选择模型" />
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
                    {fieldState.error && (
                      <FormMessage>{fieldState.error.message}</FormMessage>
                    )}
                  </FormItem>
                )}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                快速模型
                <span className="text-xs text-muted-foreground font-normal">(可选)</span>
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
                          <SelectValue placeholder="选择快速模型（可选）" />
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
                ></span>
                上次测试: {new Date(config.lastTestAt).toLocaleString()} ·{' '}
                {config.lastTestOk ? '成功' : '失败'}
              </div>
            </div>
          )}

          {/* Test output */}
          {(testing || testOutput || testError || testCommand) && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="text-sm font-medium mb-3">测试输出</div>
              {testing ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  运行中…
                </div>
              ) : (
                <div className="space-y-3">
                  {testCommand && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">执行命令</div>
                      <pre className="bg-muted/40 border border-border/50 rounded-lg p-3 text-xs overflow-auto max-h-24 whitespace-pre-wrap font-mono">
                        {testCommand}
                      </pre>
                    </div>
                  )}
                  {testError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
                      错误: {testError}
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">输出结果</div>
                    <pre className="bg-muted/40 border border-border/50 rounded-lg p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap font-mono">
                      {testOutput && testOutput.trim().length > 0 ? testOutput : '(无输出)'}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </UIForm>
      </CardContent>
    </Card>
  )
}
