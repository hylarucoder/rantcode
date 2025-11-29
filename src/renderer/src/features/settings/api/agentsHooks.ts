import { useMutation, useQuery } from '@tanstack/react-query'
import { orpc } from '@/lib/orpcQuery'

export function useAgentsQuery() {
  return useQuery(orpc.runners.get.queryOptions())
}

export function useSetAgentsMutation() {
  return useMutation(orpc.runners.set.mutationOptions())
}

export function useTestCodexAgentMutation() {
  return useMutation(orpc.runners.testCodex.mutationOptions())
}

// Detection & info
export function useAgentsInfoQuery() {
  return useQuery(orpc.runners.info.queryOptions())
}

// Claude Code tokens
export function useClaudeTokensQuery() {
  return useQuery(orpc.runners.getClaudeTokens.queryOptions())
}

export function useSetClaudeTokensMutation() {
  return useMutation(orpc.runners.setClaudeTokens.mutationOptions())
}
