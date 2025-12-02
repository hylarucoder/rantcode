import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui/spinner'

interface TestOutputPanelProps {
  testing: boolean
  testCommand: string | null
  testOutput: string | null
  testError: string | null
}

export function TestOutputPanel({
  testing,
  testCommand,
  testOutput,
  testError
}: TestOutputPanelProps) {
  const { t } = useTranslation()

  const hasContent = testing || testOutput || testError || testCommand
  if (!hasContent) return null

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <div className="text-sm font-medium mb-3">{t('settings.vendor.testOutput')}</div>
      {testing ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="md" />
          {t('common.status.running')}
        </div>
      ) : (
        <div className="space-y-3">
          {testCommand && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                {t('settings.vendor.command')}
              </div>
              <pre className="bg-muted/40 border border-border/50 rounded-lg p-3 text-xs overflow-auto max-h-24 whitespace-pre-wrap font-mono">
                {testCommand}
              </pre>
            </div>
          )}
          {testError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
              {t('settings.vendor.error')}: {testError}
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t('settings.vendor.output')}</div>
            <pre className="bg-muted/40 border border-border/50 rounded-lg p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap font-mono">
              {testOutput && testOutput.trim().length > 0 ? testOutput : t('common.label.noOutput')}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
