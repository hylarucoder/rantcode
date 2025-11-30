import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  X,
  Settings,
  Bot,
  Volume2,
  Palette,
  Languages,
  Terminal,
  Sparkles,
  Music2,
  Mic,
  ChevronRight
} from 'lucide-react'
import SingleClaudeVendor from '@/settings/SingleClaudeVendor'
import { Input } from '@/components/ui/input'
import { useAgentsInfoQuery } from '@/features/settings/api/agentsHooks'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { setRootDarkWithNoTransition } from '@/lib/theme'
import {
  useGeneralSettingsQuery,
  useSetGeneralSettingsMutation
} from '@/features/settings/api/generalHooks'
import AudioFxSettings from '@/settings/AudioFxSettings'
import SfxSettings from '@/settings/SfxSettings'
import TTSSettings from '@/settings/TTSSettings'

type Cat = 'general' | 'agents' | 'sounds'
type AgentsItem = 'codex' | 'claude' | 'kimi' | 'glm' | 'minmax'
type SoundsItem = 'sfx' | 'audioFx' | 'tts'

export default function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const PRIMARY_CATEGORIES: { key: Cat; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      key: 'general',
      label: t('settings.categories.general'),
      icon: <Settings className="h-4 w-4" />,
      desc: t('settings.categories.generalDesc')
    },
    {
      key: 'agents',
      label: t('settings.categories.agents'),
      icon: <Bot className="h-4 w-4" />,
      desc: t('settings.categories.agentsDesc')
    },
    {
      key: 'sounds',
      label: t('settings.categories.sounds'),
      icon: <Volume2 className="h-4 w-4" />,
      desc: t('settings.categories.soundsDesc')
    }
  ]

  const AGENTS_ITEMS: { key: AgentsItem; label: string; icon: React.ReactNode }[] = [
    { key: 'codex', label: t('settings.agents.codex'), icon: <Terminal className="h-3.5 w-3.5" /> },
    {
      key: 'claude',
      label: t('settings.agents.claude'),
      icon: <Sparkles className="h-3.5 w-3.5" />
    },
    { key: 'kimi', label: t('settings.agents.kimi'), icon: <Sparkles className="h-3.5 w-3.5" /> },
    { key: 'glm', label: t('settings.agents.glm'), icon: <Sparkles className="h-3.5 w-3.5" /> },
    { key: 'minmax', label: t('settings.agents.minmax'), icon: <Sparkles className="h-3.5 w-3.5" /> }
  ]

  const SOUNDS_ITEMS: { key: SoundsItem; label: string; icon: React.ReactNode }[] = [
    { key: 'sfx', label: t('settings.sounds.uiSfx'), icon: <Music2 className="h-3.5 w-3.5" /> },
    {
      key: 'audioFx',
      label: t('settings.sounds.sessionSfx'),
      icon: <Volume2 className="h-3.5 w-3.5" />
    },
    { key: 'tts', label: t('settings.sounds.tts'), icon: <Mic className="h-3.5 w-3.5" /> }
  ]

  // 从 URL 参数读取初始选中的 agent
  const agentsParam = searchParams.get('agents') as AgentsItem | null
  const validAgentsItems: AgentsItem[] = ['codex', 'claude', 'kimi', 'glm', 'minmax']
  const initialAgentsItem =
    agentsParam && validAgentsItems.includes(agentsParam) ? agentsParam : 'kimi'

  const [cat, setCat] = useState<Cat>(agentsParam ? 'agents' : 'agents')
  const [agentsItem, setAgentsItem] = useState<AgentsItem>(initialAgentsItem)
  const [soundsItem, setSoundsItem] = useState<SoundsItem>('audioFx')

  const infoQuery = useAgentsInfoQuery()
  const info = (infoQuery.data || {}) as {
    codex?: { executablePath?: string; version?: string }
    claudeCode?: { executablePath?: string; version?: string }
  }

  const getNavTitle = () => {
    if (cat === 'agents') return t('settings.nav.aiAgents')
    if (cat === 'sounds') return t('settings.nav.soundEffects')
    return t('settings.nav.preferences')
  }

  const getContentTitle = () => {
    if (cat === 'agents') {
      return AGENTS_ITEMS.find((i) => i.key === agentsItem)?.label || t('settings.agents.agentConfig')
    }
    if (cat === 'sounds') {
      return SOUNDS_ITEMS.find((i) => i.key === soundsItem)?.label || t('settings.sounds.soundSettings')
    }
    return t('settings.general.title')
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-gradient-to-br from-background via-background to-muted/20">
      {/* Left: primary categories */}
      <div className="w-52 shrink-0 border-r border-border/50 bg-muted/30 backdrop-blur-sm">
        <div className="flex h-14 items-center justify-between border-b border-border/50 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Settings className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-semibold">{t('settings.title')}</span>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-full hover:bg-destructive/10 hover:text-destructive"
            onClick={() => navigate('/')}
            aria-label={t('settings.closeSettings')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="p-3 space-y-1">
          {PRIMARY_CATEGORIES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setCat(item.key)}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200 ${
                cat === item.key
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  cat === item.key
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted/50 text-muted-foreground group-hover:bg-muted group-hover:text-foreground'
                }`}
              >
                {item.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.label}</div>
                <div className="text-[10px] text-muted-foreground truncate">{item.desc}</div>
              </div>
              <ChevronRight
                className={`h-4 w-4 opacity-0 transition-all ${
                  cat === item.key ? 'opacity-100' : 'group-hover:opacity-50'
                }`}
              />
            </button>
          ))}
        </nav>
      </div>

      {/* Middle: secondary navigation */}
      <div className="w-48 shrink-0 border-r border-border/50 bg-background/50">
        <div className="h-14 flex items-center px-4 border-b border-border/50">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {getNavTitle()}
          </span>
        </div>

        <div className="p-2">
          {cat === 'agents' ? (
            <ul className="space-y-0.5">
              {AGENTS_ITEMS.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setAgentsItem(item.key)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-all duration-150 ${
                      agentsItem === item.key
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                    }`}
                  >
                    <span
                      className={`transition-colors ${agentsItem === item.key ? 'text-primary' : ''}`}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : cat === 'sounds' ? (
            <ul className="space-y-0.5">
              {SOUNDS_ITEMS.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setSoundsItem(item.key)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-all duration-150 ${
                      soundsItem === item.key
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                    }`}
                  >
                    <span
                      className={`transition-colors ${soundsItem === item.key ? 'text-primary' : ''}`}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm bg-accent text-accent-foreground font-medium"
                >
                  <Palette className="h-3.5 w-3.5 text-primary" />
                  <span>{t('settings.general.appearance')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="h-14 flex items-center px-6 border-b border-border/50 bg-background/30 backdrop-blur-sm sticky top-0 z-10">
          <span className="text-sm font-medium">{getContentTitle()}</span>
        </div>

        <div className="p-6">
          {cat === 'agents' && agentsItem === 'codex' && (
            <AgentInfoCard
              title={t('settings.agents.codex')}
              subtitle={t('settings.agents.codexSubtitle')}
              executablePath={info?.codex?.executablePath}
              version={info?.codex?.version}
              pathPlaceholder={t('settings.agents.codexNotFound')}
              versionPlaceholder={t('settings.agents.versionEmpty')}
              onRefresh={() => infoQuery.refetch()}
              isRefetching={infoQuery.isFetching}
            />
          )}

          {cat === 'agents' && agentsItem === 'claude' && (
            <AgentInfoCard
              title={t('settings.agents.claude')}
              subtitle={t('settings.agents.claudeSubtitle')}
              executablePath={info?.claudeCode?.executablePath}
              version={info?.claudeCode?.version}
              pathPlaceholder={t('settings.agents.claudeNotFound')}
              versionPlaceholder={t('settings.agents.versionEmpty')}
              onRefresh={() => infoQuery.refetch()}
              isRefetching={infoQuery.isFetching}
            />
          )}

          {cat === 'agents' && agentsItem === 'kimi' && (
            <SingleClaudeVendor
              id="claude-kimi"
              label="Claude Code · Kimi"
              defaultConfig={{
                id: 'claude-kimi',
                displayName: 'Claude Code · Kimi',
                vendorKey: 'kimi',
                binPath: '',
                args: ['--dangerously-skip-permissions'],
                promptMode: 'stdin',
                envVars: { ANTHROPIC_BASE_URL: 'https://api.moonshot.cn/anthropic' },
                modelPrimary: 'kimi-k2-preview',
                modelFast: 'kimi-k2-turbo-preview',
                active: true
              }}
            />
          )}

          {cat === 'agents' && agentsItem === 'glm' && (
            <SingleClaudeVendor
              id="claude-glm"
              label="Claude Code · GLM"
              defaultConfig={{
                id: 'claude-glm',
                displayName: 'Claude Code · GLM',
                vendorKey: 'glm',
                binPath: '',
                args: ['--dangerously-skip-permissions'],
                promptMode: 'stdin',
                envVars: { ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic' },
                modelPrimary: 'GLM-4.6',
                modelFast: 'GLM-4.6',
                active: false
              }}
            />
          )}

          {cat === 'agents' && agentsItem === 'minmax' && (
            <SingleClaudeVendor
              id="claude-minmax"
              label="Claude Code · Minmax"
              defaultConfig={{
                id: 'claude-minmax',
                displayName: 'Claude Code · Minmax',
                vendorKey: 'minmax',
                binPath: '',
                args: ['--dangerously-skip-permissions'],
                promptMode: 'stdin',
                envVars: {},
                modelPrimary: 'MiniMax-M2',
                modelFast: 'MiniMax-M2',
                active: false
              }}
            />
          )}

          {cat === 'general' && <GeneralSettingsPanel />}

          {cat === 'sounds' && soundsItem === 'sfx' && <SfxSettings />}
          {cat === 'sounds' && soundsItem === 'audioFx' && <AudioFxSettings />}
          {cat === 'sounds' && soundsItem === 'tts' && <TTSSettings />}
        </div>
      </div>
    </div>
  )
}

function AgentInfoCard({
  title,
  subtitle,
  executablePath,
  version,
  pathPlaceholder,
  versionPlaceholder,
  onRefresh,
  isRefetching
}: {
  title: string
  subtitle: string
  executablePath?: string
  version?: string
  pathPlaceholder: string
  versionPlaceholder: string
  onRefresh: () => void
  isRefetching: boolean
}) {
  const { t } = useTranslation()

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <CardHeader className="pb-4 bg-gradient-to-r from-muted/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Terminal className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
      </CardHeader>
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
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
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

function GeneralSettingsPanel() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="pb-4 bg-gradient-to-r from-muted/50 to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <Settings className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base">{t('settings.general.basic')}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('settings.general.basicDesc')}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="py-4">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <Settings className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('settings.general.basicPlaceholder')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="pb-4 bg-gradient-to-r from-muted/50 to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
              <Palette className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <CardTitle className="text-base">{t('settings.general.appearance')}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('settings.general.appearanceDesc')}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="py-4">
          <GeneralAppearanceAndLanguage />
        </CardContent>
      </Card>
    </div>
  )
}

function GeneralAppearanceAndLanguage() {
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
            <span className="text-xs text-muted-foreground">{t('settings.general.languageEn')}</span>
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
