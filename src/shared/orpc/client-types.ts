/**
 * oRPC 客户端类型定义
 *
 * 这些类型用于 renderer 层调用 oRPC API 时的类型断言。
 * Session/Message 等实体类型已在 schemas.ts 中定义并导出。
 */

import type { z } from 'zod'
import type { Runner } from '../runners'
import type {
  listSessionsInputSchema,
  getSessionInputSchema,
  createSessionInputSchema,
  deleteSessionInputSchema,
  appendMessagesInputSchema,
  updateMessageInputSchema,
  Session
} from './schemas'

/**
 * 各 runner 的 CLI 上下文标识映射
 * 键是可选的，与 renderer 层的 RunnerContextMap 兼容
 */
export type RunnerContextMap = Partial<Record<Runner, string>>

/**
 * oRPC sessions 命名空间客户端类型
 *
 * 用于 renderer 层调用 sessions API 时的类型断言。
 * 由于 oRPC 客户端类型推导需要运行时对象，这里手动定义接口。
 */
export type SessionsNamespace = {
  list: {
    call: (input: z.infer<typeof listSessionsInputSchema>) => Promise<Session[]>
  }
  get: {
    call: (input: z.infer<typeof getSessionInputSchema>) => Promise<Session | null>
  }
  create: {
    call: (input: z.infer<typeof createSessionInputSchema>) => Promise<Session>
  }
  update: {
    call: (input: {
      projectId: string
      sessionId: string
      title?: string
      runnerContexts?: RunnerContextMap
      archived?: boolean
    }) => Promise<Session>
  }
  delete: {
    call: (input: z.infer<typeof deleteSessionInputSchema>) => Promise<{ ok: boolean }>
  }
  appendMessages: {
    call: (input: z.infer<typeof appendMessagesInputSchema>) => Promise<Session>
  }
  updateMessage: {
    call: (input: z.infer<typeof updateMessageInputSchema>) => Promise<Session>
  }
}
