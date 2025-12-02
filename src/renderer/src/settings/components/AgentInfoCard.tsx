import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Terminal } from 'lucide-react'
import { SettingsCardHeader } from './SettingsCardHeader'

interface AgentInfoCardProps {
  title: string
  subtitle: string
  executablePath?: string
  version?: string
  pathPlaceholder: string
  versionPlaceholder: string
  onRefresh: () => void
  isRefetching: boolean
}

export function AgentInfoCard({
  title,
  subtitle,
  executablePath,
  version,
  pathPlaceholder,
  versionPlaceholder,
  onRefresh,
  isRefetching
}: AgentInfoCardProps) {
  const { t } = useTranslation()

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <SettingsCardHeader
        icon={<Terminal className="h-5 w-5 text-primary" />}
        iconClassName="bg-primary/10"
        title={title}
        description={subtitle}
      />
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('settings.agents.executablePath')}
            </label>
            <Input
              value={executablePath || ''}
              disabled
              placeholder={pathPlaceholder}
              className="bg-muted/30"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('settings.agents.version')}
            </label>
            <Input
              value={version || ''}
              disabled
              placeholder={versionPlaceholder}
              className="bg-muted/30"
            />
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border/50">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={isRefetching}
            className="gap-2"
          >
            {isRefetching ? (
              <>
                <Spinner />
                {t('common.status.detecting')}
              </>
            ) : (
              t('settings.agents.redetect')
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
