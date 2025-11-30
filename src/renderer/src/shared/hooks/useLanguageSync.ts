import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useGeneralSettingsQuery } from '@/features/settings/api/generalHooks'

/**
 * 监听 generalSettings.language 变化，自动同步 i18n 语言
 */
export function useLanguageSync() {
  const { i18n } = useTranslation()
  const { data: settings } = useGeneralSettingsQuery()

  useEffect(() => {
    if (settings?.language && settings.language !== i18n.language) {
      i18n.changeLanguage(settings.language)
      localStorage.setItem('language', settings.language)
    }
  }, [settings?.language, i18n])
}

