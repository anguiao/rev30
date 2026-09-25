import { assert, describe, expect, it } from 'vitest'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { createLogger } from '../../src/runtime/logger'
import { authPasswordCredentials } from '../../src/db/schema'
import { dbTest } from '../fixtures/database'

type LogRecord = Record<string, unknown>

function createMemoryLogger() {
  const output: string[] = []
  const logger = createLogger({
    destination: {
      write(message) {
        output.push(message)
      },
    },
    level: 'info',
  })

  return {
    logger,
    record() {
      const line = output.join('').trim()

      if (!line) {
        throw new Error('Expected a log record')
      }

      return JSON.parse(line) as LogRecord
    },
  }
}

describe('runtime logger redaction', () => {
  it('redacts every supported sensitive key at the top level and within one top-level container', () => {
    const values = {
      accessSecret: 'access-secret-value',
      accessToken: 'access-token-value',
      apiKey: 'api-key-value',
      attachmentAccessToken: 'attachment-access-token-value',
      attachmentSecret: 'attachment-secret-value',
      attachmentToken: 'attachment-token-value',
      authorization: 'authorization-value',
      cookie: 'cookie-value',
      currentPassword: 'current-password-value',
      databaseUrl: 'postgres://database-url-value',
      newPassword: 'new-password-value',
      password: 'password-value',
      passwordHash: 'password-hash-value',
      temporaryPassword: 'temporary-password-value',
      refreshSecret: 'refresh-secret-value',
      refreshToken: 'refresh-token-value',
      refreshTokenHash: 'refresh-token-hash-value',
      refreshTokenId: 'refresh-token-id-value',
      secret: 'secret-value',
      signingSecret: 'signing-secret-value',
      signedToken: 'signed-token-value',
      'set-cookie': 'set-cookie-value',
      token: 'token-value',
    }
    const memory = createMemoryLogger()

    memory.logger.info(
      {
        ...values,
        nested: values,
        req: {
          headers: {
            authorization: values.authorization,
            cookie: values.cookie,
            'set-cookie': values['set-cookie'],
          },
        },
        res: {
          headers: {
            authorization: values.authorization,
            cookie: values.cookie,
            'set-cookie': values['set-cookie'],
          },
        },
      },
      'sensitive fields',
    )
    const record = memory.record()
    const serialized = JSON.stringify(record)
    const redactedValues = Object.fromEntries(Object.keys(values).map((key) => [key, '[Redacted]']))
    const redactedHeaders = {
      authorization: '[Redacted]',
      cookie: '[Redacted]',
      'set-cookie': '[Redacted]',
    }

    for (const value of Object.values(values)) {
      expect(serialized).not.toContain(value)
    }

    expect(record).toMatchObject(redactedValues)
    expect(record.nested).toEqual(redactedValues)
    expect(record.req).toEqual({ headers: redactedHeaders })
    expect(record.res).toEqual({ headers: redactedHeaders })
  })

  it('preserves diagnostic details for non-database errors', () => {
    for (const error of [
      new Error('Operation failed'),
      ...['EPERM', 'EPIPE', 'EBUSY', 'EROFS', 'ELOOP'].map((code) =>
        Object.assign(new Error('System operation failed'), { code }),
      ),
    ]) {
      const memory = createMemoryLogger()
      memory.logger.error({ err: error, requestId: 'request-1' }, 'request failed')

      expect(memory.record()).toMatchObject({
        requestId: 'request-1',
        err: { type: 'Error', message: error.message, stack: error.stack },
      })
    }
  })

  dbTest('omits SQL parameters from real database errors and nested causes', async ({ db }) => {
    const secret = 'synthetic-sensitive-password-hash'
    let queryError: unknown
    try {
      await db.transaction(async (tx) => {
        await tx.insert(authPasswordCredentials).values({
          userId: '00000000-0000-4000-8000-000000000001',
          passwordHash: secret,
        })
      })
    } catch (error) {
      queryError = error
    }
    assert.instanceOf(queryError, DrizzleQueryError)

    for (const error of [
      queryError,
      queryError.cause,
      new Error('Operation failed', { cause: queryError }),
    ]) {
      const memory = createMemoryLogger()
      memory.logger.error({ err: error, requestId: 'request-1' }, 'request failed')
      const record = memory.record()
      expect(JSON.stringify(record)).not.toContain(secret)
      expect(record).toMatchObject({
        requestId: 'request-1',
        err: { type: 'DatabaseError', message: 'Database operation failed', code: '23503' },
      })
      expect(record.err).not.toHaveProperty('params')
      expect(record.err).not.toHaveProperty('stack')
      expect(record.err).not.toHaveProperty('cause')
    }
  })
})
