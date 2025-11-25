import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X } from 'lucide-react'
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

export default function SettingsPage({ onClose }: { onClose?: () => void }) {
  type Cat = 'general' | 'agents' | 'sounds'
  type AgentsItem = 'codex' | 'claude' | 'kimi' | 'glm' | 'minmax'
  type SoundsItem = 'sfx' | 'audioFx' | 'tts'
  const [cat, setCat] = useState<Cat>('agents')
  const [agentsItem, setAgentsItem] = useState<AgentsItem>('kimi')
  const [soundsItem, setSoundsItem] = useState<SoundsItem>('audioFx')

  const infoQuery = useAgentsInfoQuery()
  const info = (infoQuery.data || {}) as {
    codex?: { executablePath?: string; version?: string }
    claudeCode?: { executablePath?: string; version?: string }
  }

  return (
    <div className="flex h-full w-full">
      {/* Left: primary categories */}
      <div className="w-48 border-r border-border/70 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Settings</div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ul className="space-y-1">
          {(
            [
              { key: 'general', label: 'General' },
              { key: 'agents', label: 'Agents' },
              { key: 'sounds', label: 'Sounds' }
            ] as { key: Cat; label: string }[]
          ).map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => setCat(item.key)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                  cat === item.key
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-transparent text-foreground hover:bg-accent/40'
                }`}
              >
                <span className="truncate font-medium">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Middle: secondary navigation */}
      <div className="w-56 border-r border-border/70 p-3">
        {cat === 'agents' ? (
          <ul className="space-y-1">
            {(
              [
                { key: 'codex', label: 'Codex' },
                { key: 'claude', label: 'Claude Code' },
                { key: 'kimi', label: 'Claude Code · Kimi' },
                { key: 'glm', label: 'Claude Code · GLM' },
                { key: 'minmax', label: 'Claude Code · Minmax' }
              ] as { key: AgentsItem; label: string }[]
            ).map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => setAgentsItem(item.key)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                    agentsItem === item.key
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-transparent text-foreground hover:bg-accent/40'
                  }`}
                >
                  <span className="truncate font-medium">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : cat === 'sounds' ? (
          <ul className="space-y-1">
            {(
              [
                { key: 'sfx', label: '内置 UI 音效' },
                { key: 'audioFx', label: '会话音效' },
                { key: 'tts', label: '播报音效' }
              ] as { key: SoundsItem; label: string }[]
            ).map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => setSoundsItem(item.key)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                    soundsItem === item.key
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-transparent text-foreground hover:bg-accent/40'
                  }`}
                >
                  <span className="truncate font-medium">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-muted-foreground">Select a section</div>
        )}
      </div>

      {/* Right: content */}
      <div className="min-w-0 flex-1 p-3">
        {cat === 'agents' && agentsItem === 'codex' && (
          <Card className="border-border/70 p-3 w-full">
            <div className="mb-2 text-sm font-semibold">Agent · Codex</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">可执行路径</div>
                <Input
                  value={info?.codex?.executablePath || ''}
                  disabled
                  placeholder="未发现 codex，可检查 PATH"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">版本</div>
                <Input
                  value={info?.codex?.version || ''}
                  disabled
                  placeholder="--version 输出为空"
                />
              </div>
            </div>
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => infoQuery.refetch()}
                disabled={infoQuery.isFetching}
              >
                {infoQuery.isFetching ? '检测中…' : '重新检测'}
              </Button>
            </div>
          </Card>
        )}
        {cat === 'agents' && agentsItem === 'claude' && (
          <Card className="border-border/70 p-3 w-full">
            <div className="mb-2 text-sm font-semibold">Agent · Claude Code</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">可执行路径</div>
                <Input
                  value={info?.claudeCode?.executablePath || ''}
                  disabled
                  placeholder="未发现 claude/claude-code，可检查 PATH"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">版本</div>
                <Input
                  value={info?.claudeCode?.version || ''}
                  disabled
                  placeholder="--version 输出为空"
                />
              </div>
            </div>
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => infoQuery.refetch()}
                disabled={infoQuery.isFetching}
              >
                {infoQuery.isFetching ? '检测中…' : '重新检测'}
              </Button>
            </div>
          </Card>
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
        {cat === 'general' && (
          <div className="grid grid-cols-2 gap-3 w-full">
            {/* 左列：预留其他通用设置位 */}
            <Card className="border-border/70 p-3 w-full min-h-[120px]">
              <div className="text-sm font-semibold mb-2">General · Basics</div>
              <div className="text-xs text-muted-foreground">更多通用设置将陆续加入…</div>
            </Card>

            {/* 右列：语言与主题 */}
            <Card className="border-border/70 p-3 w-full">
              <div className="text-sm font-semibold mb-3">General · 外观与语言</div>

              <GeneralAppearanceAndLanguage />
            </Card>
          </div>
        )}

        {cat === 'sounds' && soundsItem === 'sfx' && (
          <div className="w-full">
            <SfxSettings />
          </div>
        )}
        {cat === 'sounds' && soundsItem === 'audioFx' && (
          <div className="w-full">
            <AudioFxSettings />
          </div>
        )}
        {cat === 'sounds' && soundsItem === 'tts' && (
          <div className="w-full">
            <TTSSettings />
          </div>
        )}
      </div>
    </div>
  )
}

function GeneralAppearanceAndLanguage() {
  const query = useGeneralSettingsQuery()
  const mutate = useSetGeneralSettingsMutation()

  const lang = (query.data as { language?: string } | undefined)?.language || 'zh-CN'
  const theme = (query.data as { theme?: 'light' | 'dark' } | undefined)?.theme || 'dark'

  useEffect(() => {
    // 应用主题；同时镜像到 localStorage 以便启动阶段生效
    setRootDarkWithNoTransition(theme === 'dark')
    window.localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem('language', lang)
  }, [lang])

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <div className="text-xs font-medium">
          语言 Language <span className="text-red-500">*</span>
        </div>
        <Select
          value={lang}
          onValueChange={(v) => {
            const next = { language: v as 'zh-CN' | 'en-US', theme }
            mutate.mutate(next)
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="选择语言" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh-CN">中文（简体）</SelectItem>
            <SelectItem value="en-US">English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium">
          主题 Theme <span className="text-red-500">*</span>
        </div>
        <Select
          value={theme}
          onValueChange={(v) => {
            const next = { language: lang as 'zh-CN' | 'en-US', theme: v as 'light' | 'dark' }
            mutate.mutate(next)
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="选择主题" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
