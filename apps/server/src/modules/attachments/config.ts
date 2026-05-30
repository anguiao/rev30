import { readPositiveIntegerEnv } from '../../runtime/env'

const defaultStorageDir = '.attachments/dev'
const defaultSignedUrlTtlSeconds = 300
const minSignedUrlTtlSeconds = 60
const developmentSigningSecret = 'rev30-development-attachment-signing-secret'

export type AttachmentConfig = {
  signingSecret: string
  signedUrlTtlSeconds: number
  storageDir: string
}

function readSignedUrlTtlSeconds(env: NodeJS.ProcessEnv) {
  const value = readPositiveIntegerEnv(
    env,
    'ATTACHMENT_SIGNED_URL_TTL_SECONDS',
    defaultSignedUrlTtlSeconds,
  )

  if (value < minSignedUrlTtlSeconds) {
    throw new Error(`ATTACHMENT_SIGNED_URL_TTL_SECONDS 不能小于 ${minSignedUrlTtlSeconds}`)
  }

  return value
}

export function readAttachmentConfig(env = process.env): AttachmentConfig {
  const isProduction = env.NODE_ENV === 'production'
  const explicitSigningSecret = env.ATTACHMENT_SIGNING_SECRET?.trim()
  const signingSecret =
    explicitSigningSecret || (isProduction ? undefined : developmentSigningSecret)

  if (!signingSecret) {
    throw new Error('生产环境必须设置 ATTACHMENT_SIGNING_SECRET')
  }

  return {
    signingSecret,
    signedUrlTtlSeconds: readSignedUrlTtlSeconds(env),
    storageDir: env.ATTACHMENT_STORAGE_DIR ?? defaultStorageDir,
  }
}
