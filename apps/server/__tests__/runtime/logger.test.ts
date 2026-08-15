import { describe, expect, it } from 'vitest'
import { createLogger } from '../../src/runtime/logger'

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
      attachmentSecret: 'attachment-secret-value',
      attachmentToken: 'attachment-token-value',
      authorization: 'authorization-value',
      cookie: 'cookie-value',
      currentPassword: 'current-password-value',
      databaseUrl: 'postgres://database-url-value',
      newPassword: 'new-password-value',
      password: 'password-value',
      passwordHash: 'password-hash-value',
      refreshSecret: 'refresh-secret-value',
      refreshToken: 'refresh-token-value',
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
    const topLevel = record as typeof values
    const nested = record.nested as typeof values
    const req = record.req as { headers: Record<string, string> }
    const res = record.res as { headers: Record<string, string> }

    for (const value of Object.values(values)) {
      expect(serialized).not.toContain(value)
    }

    for (const key of Object.keys(values) as Array<keyof typeof values>) {
      expect(topLevel[key]).toBe('[Redacted]')
      expect(nested[key]).toBe('[Redacted]')
    }

    expect(req.headers).toEqual({
      authorization: '[Redacted]',
      cookie: '[Redacted]',
      'set-cookie': '[Redacted]',
    })
    expect(res.headers).toEqual({
      authorization: '[Redacted]',
      cookie: '[Redacted]',
      'set-cookie': '[Redacted]',
    })
  })
})
