const defaultStorageDir = '.attachments/dev'
const defaultSignedUrlTtlSeconds = 300
const developmentSigningSecret = 'rev30-development-attachment-signing-secret'

export type AttachmentConfig = {
  signingSecret: string
  signedUrlTtlSeconds: number
  storageDir: string
}

function readPositiveInteger(value: string | undefined, fallback: number, name: string) {
  const rawValue = value?.trim()

  if (!rawValue) {
    return fallback
  }

  if (!/^[1-9]\d*$/.test(rawValue)) {
    throw new Error(`${name} 必须是正整数`)
  }

  return Number(rawValue)
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
    signedUrlTtlSeconds: readPositiveInteger(
      env.ATTACHMENT_SIGNED_URL_TTL_SECONDS,
      defaultSignedUrlTtlSeconds,
      'ATTACHMENT_SIGNED_URL_TTL_SECONDS',
    ),
    storageDir: env.ATTACHMENT_STORAGE_DIR ?? defaultStorageDir,
  }
}
