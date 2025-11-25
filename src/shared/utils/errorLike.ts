export function isErrorLike(value: unknown): value is { message: string } {
  if (typeof value !== 'object' || value === null) return false
  const v = value as { message?: unknown }
  return typeof v.message === 'string'
}
