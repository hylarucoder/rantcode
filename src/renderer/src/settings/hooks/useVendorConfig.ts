import { useEffect, useMemo, useState } from 'react'
import { useClaudeVendorsQuery, useSetClaudeVendorsMutation } from '@/features/settings'
import {
  useAgentsInfoQuery,
  useClaudeTokensQuery,
  useSetClaudeTokensMutation
} from '@/features/settings/api/agentsHooks'
import {
  ClaudeVendorConfig,
  VendorCatalog,
  TokenKey,
  TOKEN_KEYS,
  MODEL_OPTIONS
} from '../vendorConfig'

interface UseVendorConfigOptions {
  id: string
  label: string
  defaultConfig: ClaudeVendorConfig
}

export function useVendorConfig({ id, label, defaultConfig }: UseVendorConfigOptions) {
  const vendorsQuery = useClaudeVendorsQuery()
  const setVendors = useSetClaudeVendorsMutation()

  const [config, setConfig] = useState<ClaudeVendorConfig>(defaultConfig)
  const [saving, setSaving] = useState(false)

  const infoQuery = useAgentsInfoQuery()
  const executablePath = (
    infoQuery.data as { claudeCode?: { executablePath?: string } } | undefined
  )?.claudeCode?.executablePath as string | undefined

  const tokensQuery = useClaudeTokensQuery()
  const setTokens = useSetClaudeTokensMutation()
  const tokens = (tokensQuery.data || {}) as Partial<Record<TokenKey, string>>
  const [tokenValue, setTokenValue] = useState<string>('')

  // Sync config from store
  useEffect(() => {
    const catalog = (vendorsQuery.data as VendorCatalog) || {}
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

  const tokenKey = TOKEN_KEYS[config.vendorKey]
  const vendorOptions = MODEL_OPTIONS[config.vendorKey] || []

  // Sync token value from store
  useEffect(() => {
    setTokenValue((tokens[tokenKey] as string) || '')
  }, [tokensQuery.data, tokenKey, tokens])

  const save = async (values?: { token: string; modelPrimary: string; modelFast?: string }) => {
    const catalog = (vendorsQuery.data as VendorCatalog) || {}
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
        const next: VendorCatalog = { ...catalog, [id]: nextCfg }
        await setVendors.mutateAsync(next)
      }
    } finally {
      setSaving(false)
    }
  }

  return {
    config,
    setConfig,
    updateField,
    saving,
    save,
    tokenValue,
    setTokenValue,
    tokenKey,
    tokens,
    binForSave,
    canPersist,
    vendorOptions
  }
}
