import { randomUUID } from 'node:crypto'
import { describe, expect } from 'vitest'
import { opsOperationLogs } from '../../../../src/db/schema'
import { cleanupOperationLogs } from '../../../../src/modules/ops/operation-logs/cleanup'
import { dbTest, type TestDatabase } from '../../../fixtures/database'

function operationLog(
  createdAt: Date,
  overrides: Partial<typeof opsOperationLogs.$inferInsert> = {},
): typeof opsOperationLogs.$inferInsert {
  return {
    actorUserId: randomUUID(),
    actorUsername: 'cleanup-actor',
    actorNickname: 'Cleanup Actor',
    actorIsAdmin: true,
    actorSessionId: randomUUID(),
    module: 'system',
    action: 'system:user:delete',
    targetType: 'user',
    targetKey: randomUUID(),
    result: 'success',
    httpStatus: 204,
    durationMs: 1,
    requestId: randomUUID(),
    clientIpSource: 'unavailable',
    createdAt,
    ...overrides,
  }
}

async function remainingIds(database: TestDatabase) {
  return database.select({ id: opsOperationLogs.id }).from(opsOperationLogs)
}

describe('operation log retention cleanup', () => {
  dbTest('deletes through the inclusive retention boundary and is idempotent', async ({ db }) => {
    const now = new Date('2026-08-20T00:00:00.000Z')
    const retentionMs = 180 * 24 * 60 * 60 * 1000
    await db
      .insert(opsOperationLogs)
      .values([
        operationLog(new Date(now.getTime() - retentionMs - 1)),
        operationLog(new Date(now.getTime() - retentionMs)),
        operationLog(new Date(now.getTime() - retentionMs + 1)),
      ])

    await expect(cleanupOperationLogs(db, retentionMs, now)).resolves.toBe(2)
    await expect(cleanupOperationLogs(db, retentionMs, now)).resolves.toBe(0)
    await expect(remainingIds(db)).resolves.toHaveLength(1)
  })

  dbTest('with zero retention deletes existing rows but preserves future rows', async ({ db }) => {
    const now = new Date('2026-08-20T00:00:00.000Z')
    const futureId = randomUUID()
    await db
      .insert(opsOperationLogs)
      .values([
        operationLog(new Date(now.getTime() - 1)),
        operationLog(now),
        operationLog(new Date(now.getTime() + 1), { id: futureId }),
      ])

    await expect(cleanupOperationLogs(db, 0, now)).resolves.toBe(2)
    await expect(remainingIds(db)).resolves.toEqual([{ id: futureId }])
  })

  dbTest('keeps logs when a safe retention predates representable timestamps', async ({ db }) => {
    const id = randomUUID()
    const now = new Date('2026-08-20T00:00:00.000Z')
    await db.insert(opsOperationLogs).values(operationLog(now, { id }))

    await expect(cleanupOperationLogs(db, Number.MAX_SAFE_INTEGER, now)).resolves.toBe(0)
    await expect(remainingIds(db)).resolves.toEqual([{ id }])
  })
})
