import { useMutation, useQuery } from '@tanstack/react-query'
import { orpc } from '@/lib/orpcQuery'

export function useAgentsQuery() {
  return useQuery(orpc.agents.get.queryOptions())
}

export function useSetAgentsMutation() {
  return useMutation(orpc.agents.set.mutationOptions())
}

export function useTestCodexAgentMutation() {
  return useMutation(orpc.agents.testCodex.mutationOptions())
}

// Detection & info
export function useAgentsInfoQuery() {
  return useQuery(orpc.agents.info.queryOptions())
}

// Claude Code tokens
export function useClaudeTokensQuery() {
  return useQuery(orpc.agents.getClaudeTokens.queryOptions())
}

export function useSetClaudeTokensMutation() {
  return useMutation(orpc.agents.setClaudeTokens.mutationOptions())
}
