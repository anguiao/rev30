import { readPositiveIntegerEnv } from '../../runtime/env'

const defaultAccessExpiresInSeconds = 900
const defaultRefreshExpiresInSeconds = 604800
const defaultAttachmentExpiresInSeconds = 86400
const developmentAccessSecret = 'rev30-development-access-secret'
const developmentRefreshSecret = 'rev30-development-refresh-secret'
const developmentAttachmentSecret = 'rev30-development-attachment-secret'

export type AuthConfig = {
  accessSecret: string
  refreshSecret: string
  attachmentSecret: string
  accessExpiresInSeconds: number
  refreshExpiresInSeconds: number
  attachmentExpiresInSeconds: number
  secureCookies: boolean
}

export function readAuthConfig(env = process.env): AuthConfig {
  const isProduction = env.NODE_ENV === 'production'
  const accessSecret = env.JWT_ACCESS_SECRET ?? (isProduction ? undefined : developmentAccessSecret)
  const refreshSecret =
    env.JWT_REFRESH_SECRET ?? (isProduction ? undefined : developmentRefreshSecret)
  const attachmentSecret =
    env.JWT_ATTACHMENT_SECRET ?? (isProduction ? undefined : developmentAttachmentSecret)

  if (!accessSecret) {
    throw new Error('生产环境必须设置 JWT_ACCESS_SECRET')
  }

  if (!refreshSecret) {
    throw new Error('生产环境必须设置 JWT_REFRESH_SECRET')
  }

  if (!attachmentSecret) {
    throw new Error('生产环境必须设置 JWT_ATTACHMENT_SECRET')
  }

  const refreshExpiresInSeconds = readPositiveIntegerEnv(
    env,
    'JWT_REFRESH_EXPIRES_IN_SECONDS',
    defaultRefreshExpiresInSeconds,
  )
  const attachmentExpiresInSeconds = readPositiveIntegerEnv(
    env,
    'JWT_ATTACHMENT_EXPIRES_IN_SECONDS',
    defaultAttachmentExpiresInSeconds,
  )

  if (attachmentExpiresInSeconds > refreshExpiresInSeconds) {
    throw new Error('附件读取令牌有效期不能超过刷新令牌有效期')
  }

  return {
    accessSecret,
    refreshSecret,
    attachmentSecret,
    accessExpiresInSeconds: readPositiveIntegerEnv(
      env,
      'JWT_ACCESS_EXPIRES_IN_SECONDS',
      defaultAccessExpiresInSeconds,
    ),
    refreshExpiresInSeconds,
    attachmentExpiresInSeconds,
    secureCookies: isProduction,
  }
}
