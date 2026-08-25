import { randomUUID } from 'node:crypto'
import { describe, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { opsJobRuns, opsScheduledJobs } from '../../../../src/db/schema'
import { cleanupScheduledJobRuns } from '../../../../src/modules/ops/scheduled-jobs/cleanup'
import { dbTest } from '../../../fixtures/database'

const taskKey = 'auth-session-cleanup'

function run(
  status: 'running' | 'success' | 'failure' | 'cancelled' | 'interrupted',
  finishedAt: Date | null,
  overrides: Partial<typeof opsJobRuns.$inferInsert> = {},
): typeof opsJobRuns.$inferInsert {
  const now = new Date('2026-08-20T00:00:00.000Z')
  return {
    id: randomUUID(),
    taskKey,
    triggerSource: 'scheduled',
    status,
    scheduledFor: now,
    executorId: status === 'running' ? randomUUID() : randomUUID(),
    startedAt: now,
    finishedAt,
    durationMs: status === 'running' || status === 'interrupted' ? null : 1,
    deletedCount: status === 'running' || status === 'interrupted' ? null : 0,
    failedCount: status === 'running' || status === 'interrupted' ? null : 0,
    errorCategory: status === 'failure' ? 'database' : null,
    errorSummary: status === 'failure' ? 'database failure' : null,
    ...(status === 'cancelled'
      ? {
          cancelRequestedAt: now,
          cancelRequestedByUserId: randomUUID(),
          cancelRequestedByUsername: 'cleanup-user',
          cancelRequestedByNickname: 'Cleanup User',
          cancelRequestedBySessionId: randomUUID(),
          cancelRequestId: randomUUID(),
        }
      : {}),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('scheduled job run cleanup', () => {
  dbTest('deletes only old terminal runs and protects active references', async ({ db }) => {
    const now = new Date('2026-08-20T00:00:00.000Z')
    const retentionMs = 90 * 24 * 60 * 60 * 1000
    const oldSuccess = run('success', new Date(now.getTime() - retentionMs - 1))
    const boundaryFailure = run('failure', new Date(now.getTime() - retentionMs))
    const recentCancelled = run('cancelled', new Date(now.getTime() - retentionMs + 1))
    const running = run('running', null)
    const interrupted = run('interrupted', new Date(now.getTime() - retentionMs - 1))
    const activeReferenced = run('success', new Date(now.getTime() - retentionMs - 1))

    await db
      .insert(opsJobRuns)
      .values([
        oldSuccess,
        boundaryFailure,
        recentCancelled,
        running,
        interrupted,
        activeReferenced,
      ])
    await db
      .update(opsScheduledJobs)
      .set({ activeRunId: activeReferenced.id })
      .where(eq(opsScheduledJobs.taskKey, taskKey))

    await expect(cleanupScheduledJobRuns(db, retentionMs, now)).resolves.toEqual({
      deletedCount: 3,
      failedCount: 0,
    })

    const remaining = await db.select({ id: opsJobRuns.id }).from(opsJobRuns)
    expect(remaining.map(({ id }) => id)).toEqual(
      expect.arrayContaining([recentCancelled.id, running.id, activeReferenced.id]),
    )
    expect(remaining).not.toContainEqual({ id: oldSuccess.id })
    expect(remaining).not.toContainEqual({ id: boundaryFailure.id })
    expect(remaining).not.toContainEqual({ id: interrupted.id })
  })
})
