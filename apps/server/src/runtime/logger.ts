import pino, { type DestinationStream, type Logger } from 'pino'

const sensitiveFieldNames = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'attachmentToken',
  'signedToken',
  'token',
  'secret',
  'accessSecret',
  'refreshSecret',
  'attachmentSecret',
  'signingSecret',
  'apiKey',
  'databaseUrl',
] as const

const sensitiveFieldPaths = sensitiveFieldNames.flatMap((fieldName) => {
  const fieldPath = fieldName === 'set-cookie' ? '["set-cookie"]' : fieldName

  return [fieldPath, fieldPath.startsWith('[') ? `*${fieldPath}` : `*.${fieldPath}`]
})

const headerRedactionPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers.authorization',
  'res.headers.cookie',
  'res.headers["set-cookie"]',
]

export type CreateLoggerOptions = {
  destination?: DestinationStream
  level?: string
}

function readLogLevel() {
  return process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info')
}

export function createLogger({ destination, level }: CreateLoggerOptions = {}): Logger {
  return pino(
    {
      name: 'rev30-server',
      level: level ?? readLogLevel(),
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        censor: '[Redacted]',
        paths: [...sensitiveFieldPaths, ...headerRedactionPaths],
      },
    },
    destination,
  )
}

export const logger = createLogger()
