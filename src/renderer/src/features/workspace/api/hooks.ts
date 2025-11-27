import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/lib/orpcQuery'
import type { z } from 'zod'
import type {
  sessionSchema,
  createSessionInputSchema,
  updateSessionInputSchema,
  deleteSessionInputSchema,
  appendMessagesInputSchema,
  updateMessageInputSchema
} from '@shared/orpc/schemas'
// 内部使用的 API 类型（与 types.ts 的 Session 结构兼容）
type ApiSession = z.infer<typeof sessionSchema>

type SessionsNamespace = {
  list: { call: (input: { projectId: string }) => Promise<ApiSession[]> }
  get: {
    call: (input: { projectId: string; sessionId: string }) => Promise<ApiSession | null>
  }
  create: {
    call: (input: z.infer<typeof createSessionInputSchema>) => Promise<ApiSession>
  }
  update: {
    call: (input: z.infer<typeof updateSessionInputSchema>) => Promise<ApiSession>
  }
  delete: {
    call: (input: z.infer<typeof deleteSessionInputSchema>) => Promise<{ ok: boolean }>
  }
  appendMessages: {
    call: (input: z.infer<typeof appendMessagesInputSchema>) => Promise<ApiSession>
  }
  updateMessage: {
    call: (input: z.infer<typeof updateMessageInputSchema>) => Promise<ApiSession>
  }
}

function requireSessionsNamespace(): SessionsNamespace {
  const sessions = (orpc as { sessions?: SessionsNamespace }).sessions
  if (!sessions) {
    console.error('[oRPC] orpc.sessions is undefined. orpc:', orpc)
    throw new Error('oRPC sessions namespace is unavailable')
  }
  return sessions
}

export function useSessionsQuery(projectId: string) {
  return useQuery({
    queryKey: ['sessions', 'list', projectId],
    queryFn: async () => {
      const t0 = performance.now()
      const { list } = requireSessionsNamespace()
      const result = await list.call({ projectId })
      const dt = performance.now() - t0
      console.log(`[oRPC] sessions.list call completed in ${dt.toFixed(2)}ms`)
      return result
    },
    enabled: !!projectId
  })
}

export function useSessionQuery(projectId: string, sessionId: string) {
  return useQuery({
    queryKey: ['sessions', 'get', projectId, sessionId],
    queryFn: async () => {
      const { get } = requireSessionsNamespace()
      return await get.call({ projectId, sessionId })
    },
    enabled: !!projectId && !!sessionId
  })
}

export function useCreateSessionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: z.infer<typeof createSessionInputSchema>) => {
      const { create } = requireSessionsNamespace()
      return await create.call(input)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['sessions', 'list', variables.projectId]
      })
    }
  })
}

export function useUpdateSessionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: z.infer<typeof updateSessionInputSchema>) => {
      const { update } = requireSessionsNamespace()
      return await update.call(input)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['sessions', 'list', variables.projectId]
      })
      void queryClient.invalidateQueries({
        queryKey: ['sessions', 'get', variables.projectId, variables.sessionId]
      })
    }
  })
}

export function useDeleteSessionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: z.infer<typeof deleteSessionInputSchema>) => {
      const { delete: deleteSession } = requireSessionsNamespace()
      return await deleteSession.call(input)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['sessions', 'list', variables.projectId]
      })
    }
  })
}

export function useAppendMessagesMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: z.infer<typeof appendMessagesInputSchema>) => {
      const { appendMessages } = requireSessionsNamespace()
      return await appendMessages.call(input)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['sessions', 'list', variables.projectId]
      })
      void queryClient.invalidateQueries({
        queryKey: ['sessions', 'get', variables.projectId, variables.sessionId]
      })
    }
  })
}

export function useUpdateMessageMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: z.infer<typeof updateMessageInputSchema>) => {
      const { updateMessage } = requireSessionsNamespace()
      return await updateMessage.call(input)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['sessions', 'list', variables.projectId]
      })
      void queryClient.invalidateQueries({
        queryKey: ['sessions', 'get', variables.projectId, variables.sessionId]
      })
    }
  })
}
