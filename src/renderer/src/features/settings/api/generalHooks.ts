import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { orpc } from '@/lib/orpcQuery'

export function useGeneralSettingsQuery() {
  return useQuery(orpc.app.getGeneral.queryOptions())
}

export function useSetGeneralSettingsMutation() {
  const queryClient = useQueryClient()
  const { i18n } = useTranslation()

  return useMutation({
    ...orpc.app.setGeneral.mutationOptions(),
    onSuccess: (data) => {
      // 立即切换 i18n 语言
      if (data?.language && data.language !== i18n.language) {
        i18n.changeLanguage(data.language)
        localStorage.setItem('language', data.language)
      }
      // 使 query 缓存失效，触发重新获取
      queryClient.invalidateQueries({ queryKey: orpc.app.getGeneral.queryOptions().queryKey })
    }
  })
}
