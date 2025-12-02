import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import zhCN from '@/locales/zh-CN.json'
import enUS from '@/locales/en-US.json'

export const supportedLngs = ['zh-CN', 'en-US'] as const
export type SupportedLng = (typeof supportedLngs)[number]

// 从 preload 或 localStorage 获取初始语言
function getInitialLanguage(): SupportedLng {
  const initial = (
    window as unknown as {
      api?: { initialGeneral?: { language?: string } }
    }
  ).api?.initialGeneral
  const lang = initial?.language || localStorage.getItem('language') || 'zh-CN'
  return supportedLngs.includes(lang as SupportedLng) ? (lang as SupportedLng) : 'zh-CN'
}

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS }
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en-US',
  interpolation: {
    escapeValue: false // React 已自动转义
  }
})

export default i18n
