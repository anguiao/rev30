import { readPositiveIntegerEnv } from '../../runtime/env'

const defaultStorageDir = '.attachments/dev'
const defaultUploadSessionTtlSeconds = 300
const defaultContentUrlTtlSeconds = 300
const minUploadSessionTtlSeconds = 60
const minContentUrlTtlSeconds = 60
const developmentSigningSecret = 'rev30-development-attachment-signing-secret'

export type AttachmentConfig = {
  signingSecret: string
  contentUrlTtlSeconds: number
  storageDir: string
  uploadSessionTtlSeconds: number
}

function readUploadSessionTtlSeconds(env: NodeJS.ProcessEnv) {
  const value = readPositiveIntegerEnv(
    env,
    'ATTACHMENT_UPLOAD_SESSION_TTL_SECONDS',
    defaultUploadSessionTtlSeconds,
  )

  if (value < minUploadSessionTtlSeconds) {
    throw new Error(`ATTACHMENT_UPLOAD_SESSION_TTL_SECONDS 不能小于 ${minUploadSessionTtlSeconds}`)
  }

  return value
}

function readContentUrlTtlSeconds(env: NodeJS.ProcessEnv) {
  const value = readPositiveIntegerEnv(
    env,
    'ATTACHMENT_CONTENT_URL_TTL_SECONDS',
    defaultContentUrlTtlSeconds,
  )

  if (value < minContentUrlTtlSeconds) {
    throw new Error(`ATTACHMENT_CONTENT_URL_TTL_SECONDS 不能小于 ${minContentUrlTtlSeconds}`)
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
    storageDir: env.ATTACHMENT_STORAGE_DIR ?? defaultStorageDir,
    uploadSessionTtlSeconds: readUploadSessionTtlSeconds(env),
    contentUrlTtlSeconds: readContentUrlTtlSeconds(env),
  }
}
