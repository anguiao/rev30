const defaultStorageDir = '.attachments/dev'
const developmentSigningSecret = 'rev30-development-attachment-signing-secret'

export type AttachmentConfig = {
  signingSecret: string
  storageDir: string
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
  }
}
