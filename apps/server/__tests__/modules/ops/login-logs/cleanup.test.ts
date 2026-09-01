import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, vi } from 'vitest'
import { opsLoginLogs } from '../../../../src/db/schema'
import { cleanupLoginLogs } from '../../../../src/modules/ops/login-logs/cleanup'
import { dbTest } from '../../../fixtures/database'

describe('login log retention cleanup', () => {
  afterEach(() => vi.useRealTimers())

  dbTest('removes logs at the inclusive retention boundary', async ({ db }) => {
    const now = new Date('2026-08-20T00:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const retentionMs = 90 * 24 * 60 * 60 * 1000
    const createLog = (username: string, createdAt: Date) => ({
      username,
      result: 'failure',
      failureReason: 'invalid_credentials',
      requestId: randomUUID(),
      clientIpSource: 'unavailable',
      createdAt,
    })

    await db
      .insert(opsLoginLogs)
      .values([
        createLog('older-than-retention', new Date(now.getTime() - retentionMs - 1)),
        createLog('at-retention', new Date(now.getTime() - retentionMs)),
        createLog('within-retention', new Date(now.getTime() - retentionMs + 1)),
      ])

    await expect(cleanupLoginLogs(db, retentionMs)).resolves.toBe(2)
  })
})
