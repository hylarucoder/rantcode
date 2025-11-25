import { useMutation, useQuery } from '@tanstack/react-query'
import { orpc } from '@/lib/orpcQuery'
// Types inferred from shared oRPC contract via `orpc` utils; no local alias needed.

export function useProvidersQuery() {
  return useQuery(orpc.providers.get.queryOptions())
}

export function useSetProvidersMutation() {
  return useMutation(orpc.providers.set.mutationOptions())
}

// Claude Code vendors
export function useClaudeVendorsQuery() {
  return useQuery(orpc.vendors.getClaudeCode.queryOptions())
}

export function useSetClaudeVendorsMutation() {
  return useMutation(orpc.vendors.setClaudeCode.mutationOptions())
}

export function useTestClaudeVendorMutation() {
  return useMutation(orpc.vendors.testClaudeCode.mutationOptions())
}

export function useRunClaudePromptMutation() {
  return useMutation(orpc.vendors.runClaudePrompt.mutationOptions())
}
