import pino, { type DestinationStream, type Logger } from 'pino'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { protocol } from '@electric-sql/pglite'
import postgres from 'postgres'

const sensitiveFieldNames = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'temporaryPassword',
  'accessToken',
  'refreshToken',
  'refreshTokenId',
  'refreshTokenHash',
  'attachmentAccessToken',
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

function serializeError(error: unknown) {
  let cause = error
  let databaseError = false
  let code: string | undefined
  const visited = new Set<Error>()

  while (cause instanceof Error && !visited.has(cause)) {
    visited.add(cause)
    if (
      cause instanceof DrizzleQueryError ||
      cause instanceof postgres.PostgresError ||
      cause instanceof protocol.messages.DatabaseError
    ) {
      databaseError = true
      if ('code' in cause && typeof cause.code === 'string' && /^[0-9A-Z]{5}$/.test(cause.code)) {
        code = cause.code
      }
    }
    cause = cause.cause
  }

  // Database error messages, stacks, and causes can embed SQL parameter values.
  if (databaseError) {
    return {
      type: 'DatabaseError',
      message: 'Database operation failed',
      ...(code ? { code } : {}),
    }
  }

  return error instanceof Error
    ? pino.stdSerializers.err(error)
    : { type: 'Error', message: 'Non-Error value thrown' }
}

export function createLogger({ destination, level }: CreateLoggerOptions = {}): Logger {
  return pino(
    {
      name: 'rev30-server',
      level: level ?? readLogLevel(),
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: { err: serializeError },
      redact: {
        censor: '[Redacted]',
        paths: [...sensitiveFieldPaths, ...headerRedactionPaths],
      },
    },
    destination,
  )
}

export const logger = createLogger()
