const defaultAccessExpiresInSeconds = 900
const defaultRefreshExpiresInSeconds = 604800
const developmentAccessSecret = 'rev30-development-access-secret'
const developmentRefreshSecret = 'rev30-development-refresh-secret'

export type AuthConfig = {
  accessSecret: string
  refreshSecret: string
  accessExpiresInSeconds: number
  refreshExpiresInSeconds: number
  secureCookies: boolean
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === '') {
    return fallback
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('JWT expiration values must be positive integers')
  }

  return parsed
}

export function readAuthConfig(env = process.env): AuthConfig {
  const isProduction = env.NODE_ENV === 'production'
  const accessSecret = env.JWT_ACCESS_SECRET ?? (isProduction ? undefined : developmentAccessSecret)
  const refreshSecret =
    env.JWT_REFRESH_SECRET ?? (isProduction ? undefined : developmentRefreshSecret)

  if (!accessSecret) {
    throw new Error('JWT_ACCESS_SECRET is required in production')
  }

  if (!refreshSecret) {
    throw new Error('JWT_REFRESH_SECRET is required in production')
  }

  return {
    accessSecret,
    refreshSecret,
    accessExpiresInSeconds: readPositiveInteger(
      env.JWT_ACCESS_EXPIRES_IN_SECONDS,
      defaultAccessExpiresInSeconds,
    ),
    refreshExpiresInSeconds: readPositiveInteger(
      env.JWT_REFRESH_EXPIRES_IN_SECONDS,
      defaultRefreshExpiresInSeconds,
    ),
    secureCookies: isProduction,
  }
}
