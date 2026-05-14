const defaultAccessExpiresInSeconds = 900
const defaultRefreshExpiresInSeconds = 604800
const defaultLoginFailureMaxAttempts = 5
const defaultLoginFailureWindowSeconds = 900
const defaultLoginFailureLockSeconds = 900
const developmentAccessSecret = 'rev30-development-access-secret'
const developmentRefreshSecret = 'rev30-development-refresh-secret'

export type AuthConfig = {
  accessSecret: string
  refreshSecret: string
  accessExpiresInSeconds: number
  refreshExpiresInSeconds: number
  loginFailureMaxAttempts: number
  loginFailureWindowSeconds: number
  loginFailureLockSeconds: number
  secureCookies: boolean
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === '') {
    return fallback
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('JWT 过期时间必须是正整数')
  }

  return parsed
}

export function readAuthConfig(env = process.env): AuthConfig {
  const isProduction = env.NODE_ENV === 'production'
  const accessSecret = env.JWT_ACCESS_SECRET ?? (isProduction ? undefined : developmentAccessSecret)
  const refreshSecret =
    env.JWT_REFRESH_SECRET ?? (isProduction ? undefined : developmentRefreshSecret)

  if (!accessSecret) {
    throw new Error('生产环境必须设置 JWT_ACCESS_SECRET')
  }

  if (!refreshSecret) {
    throw new Error('生产环境必须设置 JWT_REFRESH_SECRET')
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
    loginFailureMaxAttempts: readPositiveInteger(
      env.AUTH_LOGIN_FAILURE_MAX_ATTEMPTS,
      defaultLoginFailureMaxAttempts,
    ),
    loginFailureWindowSeconds: readPositiveInteger(
      env.AUTH_LOGIN_FAILURE_WINDOW_SECONDS,
      defaultLoginFailureWindowSeconds,
    ),
    loginFailureLockSeconds: readPositiveInteger(
      env.AUTH_LOGIN_FAILURE_LOCK_SECONDS,
      defaultLoginFailureLockSeconds,
    ),
    secureCookies: isProduction,
  }
}
