import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

/**
 * Sessions 表 - 会话
 *
 * 每个会话属于一个项目，包含多条消息
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    title: text('title').notNull(),
    /** 各 runner 的 CLI 上下文标识映射，JSON 字符串 */
    runnerContexts: text('runner_contexts'),
    /** 是否已归档（不删除但隐藏） */
    archived: integer('archived', { mode: 'boolean' }).default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => [index('sessions_project_idx').on(table.projectId)]
)

/**
 * Messages 表 - 消息
 *
 * 每条消息属于一个会话
 */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),
    /** 执行追踪标识（用于关联 RunnerEvent） */
    traceId: text('trace_id'),
    status: text('status'), // 'running' | 'success' | 'error'
    /** 执行日志，JSON 字符串 */
    logs: text('logs'),
    output: text('output'),
    errorMessage: text('error_message'),
    /** 任务开始执行的时间戳（ms） */
    startedAt: integer('started_at', { mode: 'number' }),
    /** 执行任务的 runner */
    runner: text('runner'),
    /** 消息创建顺序 */
    createdAt: text('created_at').notNull()
  },
  (table) => [index('messages_session_idx').on(table.sessionId)]
)

// 导出类型
export type SessionRow = typeof sessions.$inferSelect
export type NewSessionRow = typeof sessions.$inferInsert
export type MessageRow = typeof messages.$inferSelect
export type NewMessageRow = typeof messages.$inferInsert
