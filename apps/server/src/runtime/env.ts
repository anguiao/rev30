export function readPositiveIntegerEnv(env: NodeJS.ProcessEnv, name: string, fallback: number) {
  const rawValue = env[name]?.trim()

  if (!rawValue) {
    return fallback
  }

  const value = Number(rawValue)

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数`)
  }

  return value
}
