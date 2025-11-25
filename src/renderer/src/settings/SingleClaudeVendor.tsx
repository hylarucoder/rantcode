import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription
} from '@/components/ui/form'
import { Save, TestTube2, Pin, PinOff, Eye, EyeOff } from 'lucide-react'
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
  // removed unused touched state flags
  const [testOutput, setTestOutput] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testCommand, setTestCommand] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    if (testCommand) {
      // Log the exact command to DevTools console for visibility
      console.log('[Claude run] Command:', testCommand)
    }
  }, [testCommand])

  // Detect single executable for Claude Code
  const infoQuery = useAgentsInfoQuery()
  const executablePath = (
    infoQuery.data as { claudeCode?: { executablePath?: string } } | undefined
  )?.claudeCode?.executablePath as string | undefined

  // Vendor token (per backend)
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

  // 单一可执行路径：以探测结果为准
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
      // 1) 保存 token（必填）
      const nextTokenVal = (values?.token ?? tokenValue) || ''
      const nextTokens = { ...tokens, [tokenKey]: nextTokenVal }
      await setTokens.mutateAsync(nextTokens)
      // 2) 保存模型等（若已探测到可执行路径则一并保存）
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

  return (
    <Card className="border-border/70 p-3 w-full">
      <UIForm form={form}>
        <div className="mb-2 text-sm font-semibold">{label}</div>
        <div className="mb-3 flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            className="inline-flex items-center gap-1"
            onClick={form.handleSubmit(async (values) => {
              await save(values)
              // 将模型从表单同步到本地 config，以便 UI 立即反映
              updateField('modelPrimary', values.modelPrimary)
              updateField('modelFast', values.modelFast || '')
            })}
            disabled={saving || !form.formState.isValid}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={config.active ? 'secondary' : 'default'}
            className="inline-flex items-center gap-1"
            onClick={() => updateField('active', !config.active)}
          >
            {config.active ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            {config.active ? 'Unpin' : 'Pin as default'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="inline-flex items-center gap-1"
            onClick={askWhatModel}
            disabled={testing || !canPersist || !tokenValue || tokenValue.trim().length === 0}
          >
            <TestTube2 className="h-3.5 w-3.5" />
            {testing ? 'Running…' : 'Ask “你是什么大模型”'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Display Name</p>
            <Input
              placeholder={label}
              value={config.displayName || ''}
              onChange={(e) => updateField('displayName', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Executable</p>
            <Input value={binForSave} disabled placeholder="Detecting claude/claude-code…" />
          </div>
        </div>

        {/* Token per vendor */}
        <div className="space-y-2 mt-3">
          <FormItem>
            <FormLabel>
              API Key <span className="text-red-500">*</span>
            </FormLabel>
            <FormField
              control={form.control}
              name="token"
              render={({ field, fieldState }) => (
                <>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        id={`${id}-token-input`}
                        type={showApiKey ? 'text' : 'password'}
                        className="pr-9"
                        placeholder={
                          tokenKey === 'kimi'
                            ? 'KIMI_API_KEY'
                            : tokenKey === 'glm'
                              ? 'ZHIPU_API_KEY'
                              : tokenKey === 'minmax'
                                ? 'MINMAX_API_KEY'
                                : 'ANTHROPIC_API_KEY'
                        }
                        // no-op: removed touched state
                        onChange={(e) => {
                          field.onChange(e)
                          setTokenValue(e.target.value)
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowApiKey((v) => !v)}
                        aria-label={showApiKey ? 'Hide API Key' : 'Show API Key'}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage>{fieldState.error?.message}</FormMessage>
                </>
              )}
            />
            <FormDescription className="sr-only">Vendor API Key</FormDescription>
          </FormItem>
        </div>

        {/* 只保留模型配置，其他高级项先隐藏以简化体验 */}

        <div className="grid grid-cols-2 gap-4 mt-3">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Primary Model（主要模型）
            </p>
            <FormField
              control={form.control}
              name="modelPrimary"
              render={({ field, fieldState }) => (
                <>
                  {config.vendorKey === 'custom' ? (
                    <Input {...field} />
                  ) : (
                    <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a model" />
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
                  <FormMessage>{fieldState.error?.message}</FormMessage>
                </>
              )}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Fast Model（快速模型，可选）
            </p>
            <FormField
              control={form.control}
              name="modelFast"
              render={({ field }) => (
                <>
                  {config.vendorKey === 'custom' ? (
                    <Input {...field} />
                  ) : (
                    <Select value={field.value || ''} onValueChange={(v) => field.onChange(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a fast model (optional)" />
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
                </>
              )}
            />
          </div>
        </div>

        {/* 环境变量区块暂不展示 */}

        <div className="mt-2 text-xs text-muted-foreground">
          {typeof config.lastTestAt === 'number' && (
            <span>
              Last test: {new Date(config.lastTestAt).toLocaleString()} ·{' '}
              {config.lastTestOk ? 'OK' : 'Fail'}
            </span>
          )}
        </div>
        {(testing || testOutput || testError || testCommand) && (
          <div className="mt-3">
            <div className="text-xs font-semibold">Run Output</div>
            {testing ? (
              <div className="text-xs text-muted-foreground">Running…</div>
            ) : (
              <div className="mt-1">
                {testCommand && (
                  <div className="mb-2">
                    <div className="text-[11px] text-muted-foreground">Command</div>
                    <pre className="bg-muted/40 border border-border rounded p-2 text-[11px] overflow-auto max-h-24 whitespace-pre-wrap">
                      {testCommand}
                    </pre>
                  </div>
                )}
                {testError && <div className="mb-1 text-xs text-red-500">Error: {testError}</div>}
                <pre className="bg-accent/20 border border-border rounded p-2 text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                  {testOutput && testOutput.trim().length > 0 ? testOutput : '(no output)'}
                </pre>
              </div>
            )}
          </div>
        )}
      </UIForm>
    </Card>
  )
}

// removed inline suggestions; now using Select with vendor-specific options
