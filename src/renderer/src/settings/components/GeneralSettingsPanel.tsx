import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Palette, Languages } from 'lucide-react'
import { Claude } from '@lobehub/icons'
import { setRootDarkWithNoTransition } from '@/lib/theme'
import {
  useGeneralSettingsQuery,
  useSetGeneralSettingsMutation
} from '@/features/settings/api/generalHooks'
import { SettingsCardHeader } from './SettingsCardHeader'

export function GeneralSettingsPanel() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <SettingsCardHeader
          icon={<Claude className="h-5 w-5 text-blue-500" />}
          iconClassName="bg-blue-500/10"
          title={t('settings.general.basic')}
          description={t('settings.general.basicDesc')}
        />
        <CardContent className="py-4">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <Claude className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('settings.general.basicPlaceholder')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <SettingsCardHeader
          icon={<Palette className="h-5 w-5 text-violet-500" />}
          iconClassName="bg-violet-500/10"
          title={t('settings.general.appearance')}
          description={t('settings.general.appearanceDesc')}
        />
        <CardContent className="py-4">
          <AppearanceAndLanguage />
        </CardContent>
      </Card>
    </div>
  )
}

function AppearanceAndLanguage() {
  const { t } = useTranslation()
  const query = useGeneralSettingsQuery()
  const mutate = useSetGeneralSettingsMutation()

  const lang = (query.data as { language?: string } | undefined)?.language || 'zh-CN'
  const theme = (query.data as { theme?: 'light' | 'dark' } | undefined)?.theme || 'dark'

  useEffect(() => {
    setRootDarkWithNoTransition(theme === 'dark')
    window.localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem('language', lang)
  }, [lang])

  return (
    <div className="grid gap-5 py-2">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <label className="text-sm font-medium">
            {t('settings.general.language')}{' '}
            <span className="text-xs text-muted-foreground">
              {t('settings.general.languageEn')}
            </span>
          </label>
        </div>
        <Select
          value={lang}
          onValueChange={(v) => {
            const next = { language: v as 'zh-CN' | 'en-US', theme }
            mutate.mutate(next)
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('settings.general.selectLanguage')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh-CN">
              <span className="flex items-center gap-2">
                <span>🇨🇳</span>
                <span>{t('settings.general.zhCN')}</span>
              </span>
            </SelectItem>
            <SelectItem value="en-US">
              <span className="flex items-center gap-2">
                <span>🇺🇸</span>
                <span>{t('settings.general.enUS')}</span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <label className="text-sm font-medium">
            {t('settings.general.theme')}{' '}
            <span className="text-xs text-muted-foreground">{t('settings.general.themeEn')}</span>
          </label>
        </div>
        <Select
          value={theme}
          onValueChange={(v) => {
            const next = { language: lang as 'zh-CN' | 'en-US', theme: v as 'light' | 'dark' }
            mutate.mutate(next)
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('settings.general.selectTheme')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">
              <span className="flex items-center gap-2">
                <span>☀️</span>
                <span>{t('settings.general.lightMode')}</span>
              </span>
            </SelectItem>
            <SelectItem value="dark">
              <span className="flex items-center gap-2">
                <span>🌙</span>
                <span>{t('settings.general.darkMode')}</span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
