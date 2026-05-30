import { readPositiveIntegerEnv } from '../../runtime/env'

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
    accessExpiresInSeconds: readPositiveIntegerEnv(
      env,
      'JWT_ACCESS_EXPIRES_IN_SECONDS',
      defaultAccessExpiresInSeconds,
    ),
    refreshExpiresInSeconds: readPositiveIntegerEnv(
      env,
      'JWT_REFRESH_EXPIRES_IN_SECONDS',
      defaultRefreshExpiresInSeconds,
    ),
    loginFailureMaxAttempts: readPositiveIntegerEnv(
      env,
      'AUTH_LOGIN_FAILURE_MAX_ATTEMPTS',
      defaultLoginFailureMaxAttempts,
    ),
    loginFailureWindowSeconds: readPositiveIntegerEnv(
      env,
      'AUTH_LOGIN_FAILURE_WINDOW_SECONDS',
      defaultLoginFailureWindowSeconds,
    ),
    loginFailureLockSeconds: readPositiveIntegerEnv(
      env,
      'AUTH_LOGIN_FAILURE_LOCK_SECONDS',
      defaultLoginFailureLockSeconds,
    ),
    secureCookies: isProduction,
  }
}
