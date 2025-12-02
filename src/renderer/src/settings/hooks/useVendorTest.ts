import { useEffect, useState } from 'react'
import { useRunClaudePromptMutation } from '@/features/settings/api/hooks'
import { ClaudeVendorConfig, TokenKey, ENV_KEY_NAMES } from '../vendorConfig'

interface UseVendorTestOptions {
  config: ClaudeVendorConfig
  binForSave: string
  canPersist: boolean
  tokenValue: string
  tokenKey: TokenKey
  onTestComplete?: (ok: boolean) => void
}

export interface TestResult {
  testing: boolean
  testOutput: string | null
  testError: string | null
  testCommand: string | null
}

export function useVendorTest({
  config,
  binForSave,
  canPersist,
  tokenValue,
  tokenKey,
  onTestComplete
}: UseVendorTestOptions) {
  const runPromptMutation = useRunClaudePromptMutation()

  const [testing, setTesting] = useState(false)
  const [testOutput, setTestOutput] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testCommand, setTestCommand] = useState<string | null>(null)

  useEffect(() => {
    if (testCommand) {
      // eslint-disable-next-line no-console -- debug output for test command
      console.log('[Claude run] Command:', testCommand)
    }
  }, [testCommand])

  const askWhatModel = async () => {
    if (!canPersist) return
    if (!tokenValue || tokenValue.trim().length === 0) return
    try {
      setTesting(true)
      setTestOutput(null)
      setTestError(null)
      const envKey = ENV_KEY_NAMES[tokenKey]
      const res = (await runPromptMutation.mutateAsync({
        config: {
          ...config,
          binPath: binForSave,
          promptMode: 'arg',
          envVars: { ...(config.envVars || {}), [envKey]: tokenValue }
        },
        prompt: '你是什么大模型'
      })) as { ok: boolean; error?: string; output?: string; command?: string }

      setTestOutput(res.output || '')
      setTestError(res.ok ? null : res.error || null)
      setTestCommand(res.command || null)
      onTestComplete?.(!!res.ok)
    } finally {
      setTesting(false)
    }
  }

  const canTest = canPersist && !!tokenValue && tokenValue.trim().length > 0

  const clearTestResults = () => {
    setTestOutput(null)
    setTestError(null)
    setTestCommand(null)
  }

  return {
    testing,
    testOutput,
    testError,
    testCommand,
    askWhatModel,
    canTest,
    clearTestResults
  }
}
