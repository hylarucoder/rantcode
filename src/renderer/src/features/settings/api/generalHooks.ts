import { useMutation, useQuery } from '@tanstack/react-query'
import { orpc } from '@/lib/orpcQuery'

export function useGeneralSettingsQuery() {
  return useQuery(orpc.app.getGeneral.queryOptions())
}

export function useSetGeneralSettingsMutation() {
  return useMutation(orpc.app.setGeneral.mutationOptions())
}
