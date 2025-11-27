import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { app } from 'electron'
import type { ZodType } from 'zod'

export interface JsonStore<T> {
  read(): Promise<T>
  write(data: T): Promise<void>
}

/**
 * 创建一个基于 JSON 文件的持久化 store
 * @param filename - 文件名（存储在 userData 目录下）
 * @param options - 可选配置
 * @param options.defaultValue - 读取失败时的默认值
 * @param options.schema - 可选的 zod schema 用于验证
 */
export function createJsonStore<T extends object>(
  filename: string,
  options?: {
    defaultValue?: T
    schema?: ZodType<T>
  }
): JsonStore<T> {
  const defaultValue = options?.defaultValue ?? ({} as T)
  const schema = options?.schema

  function getStorePath(): string {
    return path.join(app.getPath('userData'), filename)
  }

  return {
    async read(): Promise<T> {
      const file = getStorePath()
      try {
        const raw = await fs.readFile(file, 'utf8')
        const parsed = JSON.parse(raw)
        if (schema) {
          const result = schema.safeParse(parsed)
          return result.success ? result.data : defaultValue
        }
        if (parsed && typeof parsed === 'object') {
          return parsed as T
        }
        return defaultValue
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
          return defaultValue
        }
        throw err
      }
    },

    async write(data: T): Promise<void> {
      const file = getStorePath()
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
    }
  }
}
