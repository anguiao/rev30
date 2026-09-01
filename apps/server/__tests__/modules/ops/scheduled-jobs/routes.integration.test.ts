import { randomUUID } from 'node:crypto'
import {
  scheduledJobCancelResponseSchema,
  scheduledJobListResponseSchema,
  scheduledJobManualExecuteOverlapResponseSchema,
  scheduledJobRunDetailSchema,
  scheduledJobRunListResponseSchema,
  scheduledJobSchema,
} from '@rev30/contracts'
import { eq } from 'drizzle-orm'
import { describe, expect, vi } from 'vitest'
import { opsJobRuns, opsScheduledJobs } from '../../../../src/db/schema'
import { createApp, createTestScheduledJobService } from '../../../helpers/app'
import { createSystemAccessFixture } from '../../../helpers/auth'
import type { OperationLogEvent } from '../../../../src/runtime/operation-log'
import {
  ScheduledJobNotFoundError,
  ScheduledJobStateConflictError,
} from '../../../../src/modules/ops/scheduled-jobs/errors'
import { scheduledJobTaskKeys } from '../../../../src/modules/ops/scheduled-jobs/registry'
import type { ScheduledJobScheduler } from '../../../../src/modules/ops/scheduled-jobs/scheduler'
import { dbTest } from '../../../fixtures/database'

const taskKey = scheduledJobTaskKeys[0]
const activeRunId = '20000000-0000-4000-8000-000000000001'
const terminalRunId = '20000000-0000-4000-8000-000000000002'

function createScheduler() {
  return {
    start: vi.fn<ScheduledJobScheduler['start']>(async () => undefined),
    runManual: vi.fn<ScheduledJobScheduler['runManual']>(async () => ({
      runId: randomUUID(),
      blockedByRunId: null,
      scheduledFor: null,
    })),
    requestCancellation: vi.fn<ScheduledJobScheduler['requestCancellation']>(async () => {
      throw new Error('not configured')
    }),
    wake: vi.fn<ScheduledJobScheduler['wake']>(),
    stop: vi.fn<ScheduledJobScheduler['stop']>(async () => undefined),
  } satisfies ScheduledJobScheduler
}

function receiver(events: OperationLogEvent[]) {
  return (event: OperationLogEvent) => events.push(event)
}

describe('scheduled job HTTP routes', () => {
  dbTest(
    'lists every plan with independent current and latest terminal summaries',
    async ({ db }) => {
      const reader = await createSystemAccessFixture(db, {
        accessCodes: ['ops:scheduled-job:list'],
        usernamePrefix: 'scheduled-job-reader',
      })
      const scheduler = createScheduler()
      await db.insert(opsJobRuns).values([
        {
          id: activeRunId,
          taskKey,
          triggerSource: 'scheduled',
          status: 'running',
          scheduledFor: new Date('2026-08-25T00:00:00.000Z'),
          startedAt: new Date('2026-08-25T00:00:01.000Z'),
          createdAt: new Date('2026-08-25T00:00:01.000Z'),
        },
        {
          id: terminalRunId,
          taskKey,
          triggerSource: 'scheduled',
          status: 'success',
          scheduledFor: new Date('2026-08-24T00:00:00.000Z'),
          deletedCount: 2,
          failedCount: 0,
          startedAt: new Date('2026-08-24T00:00:01.000Z'),
          finishedAt: new Date('2026-08-24T00:00:02.000Z'),
          durationMs: 1000,
          createdAt: new Date('2026-08-24T00:00:01.000Z'),
        },
      ])
      await db
        .update(opsScheduledJobs)
        .set({ activeRunId })
        .where(eq(opsScheduledJobs.taskKey, taskKey))
      const app = createApp(db, {
        scheduledJobService: createTestScheduledJobService(db, scheduler),
      })

      const response = await app.request('/api/ops/scheduled-jobs', {
        headers: reader.authHeaders,
      })
      const body = scheduledJobListResponseSchema.parse(await response.json())
      const item = body.find((entry) => entry.taskKey === taskKey)
      const detailResponse = await app.request(`/api/ops/scheduled-jobs/${taskKey}`, {
        headers: reader.authHeaders,
      })
      const detail = scheduledJobSchema.parse(await detailResponse.json())

      expect(response.status).toBe(200)
      expect(body).toHaveLength(8)
      expect(item?.currentRun).toMatchObject({ id: activeRunId, status: 'running' })
      expect(item?.lastRun).toMatchObject({ id: terminalRunId, status: 'success' })
      expect(detailResponse.status).toBe(200)
      expect(detail).toMatchObject({ taskKey, name: `Definition ${taskKey}` })
    },
  )

  dbTest(
    'uses exact permissions and maps malformed, unknown, and strict request boundaries',
    async ({ db }) => {
      const listOnly = await createSystemAccessFixture(db, {
        accessCodes: ['ops:scheduled-job:list'],
        usernamePrefix: 'scheduled-job-list-only',
      })
      const operator = await createSystemAccessFixture(db, {
        accessCodes: [
          'ops:scheduled-job:update',
          'ops:scheduled-job:execute',
          'ops:scheduled-job:cancel',
        ],
        usernamePrefix: 'scheduled-job-operator',
      })
      const events: OperationLogEvent[] = []
      const scheduler = createScheduler()
      const app = createApp(db, {
        scheduledJobService: createTestScheduledJobService(db, scheduler),
        operationLogReceiver: receiver(events),
      })

      expect(
        (
          await app.request(`/api/ops/scheduled-jobs/${taskKey}/runs`, {
            method: 'POST',
            headers: listOnly.authHeaders,
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await app.request(`/api/ops/scheduled-jobs/${taskKey}/enabled`, {
            method: 'PUT',
            headers: { ...listOnly.authHeaders, 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: true }),
          })
        ).status,
      ).toBe(403)
      expect(scheduler.runManual).not.toHaveBeenCalled()

      expect(
        (
          await app.request(`/api/ops/scheduled-jobs/${taskKey}`, {
            headers: operator.authHeaders,
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await app.request(`/api/ops/scheduled-jobs/${taskKey}/runs`, {
            headers: operator.authHeaders,
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await app.request('/api/ops/scheduled-jobs/not-registered', {
            headers: listOnly.authHeaders,
          })
        ).status,
      ).toBe(404)
      expect(
        (
          await app.request('/api/ops/scheduled-jobs/not-registered/runs', {
            headers: listOnly.authHeaders,
          })
        ).status,
      ).toBe(404)
      expect(
        (
          await app.request(`/api/ops/scheduled-jobs/${taskKey}/runs/not-a-uuid`, {
            headers: listOnly.authHeaders,
          })
        ).status,
      ).toBe(400)

      const invalidPlan = await app.request(`/api/ops/scheduled-jobs/${taskKey}`, {
        method: 'PUT',
        headers: { ...operator.authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ cronExpression: 'not cron', timezone: 'UTC' }),
      })
      expect(invalidPlan.status).toBe(400)
      expect(events).toMatchObject([
        {
          action: 'ops:scheduled-job:update',
          httpStatus: 400,
          targetKey: taskKey,
        },
      ])

      const extraEnabledBody = await app.request(`/api/ops/scheduled-jobs/${taskKey}/enabled`, {
        method: 'PUT',
        headers: { ...operator.authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false, unexpected: true }),
      })
      expect(extraEnabledBody.status).toBe(400)
    },
  )

  dbTest(
    'passes the current user, wakes after plan update, and records command actions',
    async ({ db }) => {
      const operator = await createSystemAccessFixture(db, {
        accessCodes: ['ops:scheduled-job:update', 'ops:scheduled-job:execute'],
        usernamePrefix: 'scheduled-job-command',
      })
      const events: OperationLogEvent[] = []
      const scheduler = createScheduler()
      const app = createApp(db, {
        scheduledJobService: createTestScheduledJobService(db, scheduler),
        operationLogReceiver: receiver(events),
      })

      const execute = await app.request(`/api/ops/scheduled-jobs/${taskKey}/runs`, {
        method: 'POST',
        headers: operator.authHeaders,
      })
      expect(execute.status).toBe(202)
      expect(scheduler.runManual).toHaveBeenCalledWith({
        taskKey,
        actor: expect.objectContaining({
          id: operator.userId,
          username: expect.any(String),
          nickname: expect.any(String),
        }),
      })

      const update = await app.request(`/api/ops/scheduled-jobs/${taskKey}`, {
        method: 'PUT',
        headers: { ...operator.authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ cronExpression: '15 * * * *', timezone: 'UTC' }),
      })
      expect(update.status).toBe(200)
      expect(scheduler.wake).toHaveBeenCalledTimes(1)
      expect(
        events.map(({ action, httpStatus, targetKey: eventTargetKey }) => ({
          action,
          httpStatus,
          targetKey: eventTargetKey,
        })),
      ).toEqual([
        { action: 'ops:scheduled-job:execute', httpStatus: 202, targetKey: taskKey },
        { action: 'ops:scheduled-job:update', httpStatus: 200, targetKey: taskKey },
      ])
    },
  )

  dbTest(
    'toggles enabled state without cancelling the active run and records both actions',
    async ({ db }) => {
      const operator = await createSystemAccessFixture(db, {
        accessCodes: ['ops:scheduled-job:update'],
        usernamePrefix: 'scheduled-job-toggle',
      })
      const runId = '20000000-0000-4000-8000-000000000010'
      const startedAt = new Date('2026-08-25T00:00:01.000Z')
      await db.insert(opsJobRuns).values({
        id: runId,
        taskKey,
        triggerSource: 'scheduled',
        status: 'running',
        scheduledFor: new Date('2026-08-25T00:00:00.000Z'),
        startedAt,
        createdAt: startedAt,
      })
      await db
        .update(opsScheduledJobs)
        .set({ activeRunId: runId })
        .where(eq(opsScheduledJobs.taskKey, taskKey))
      const events: OperationLogEvent[] = []
      const scheduler = createScheduler()
      const app = createApp(db, {
        scheduledJobService: createTestScheduledJobService(db, scheduler),
        operationLogReceiver: receiver(events),
      })

      const disable = await app.request(`/api/ops/scheduled-jobs/${taskKey}/enabled`, {
        method: 'PUT',
        headers: { ...operator.authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      expect(disable.status).toBe(200)
      const disabledBody = scheduledJobSchema.parse(await disable.json())
      expect(disabledBody).toMatchObject({ taskKey, enabled: false, nextRunAt: null })
      const [disabledPlan] = await db
        .select()
        .from(opsScheduledJobs)
        .where(eq(opsScheduledJobs.taskKey, taskKey))
      expect(disabledPlan).toMatchObject({ activeRunId: runId, enabled: false, nextRunAt: null })

      const beforeEnable = new Date()
      const enable = await app.request(`/api/ops/scheduled-jobs/${taskKey}/enabled`, {
        method: 'PUT',
        headers: { ...operator.authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })
      expect(enable.status).toBe(200)
      const enabledBody = scheduledJobSchema.parse(await enable.json())
      expect(enabledBody.enabled).toBe(true)
      expect(enabledBody.nextRunAt).not.toBeNull()
      expect(Date.parse(enabledBody.nextRunAt!)).toBeGreaterThan(beforeEnable.getTime())
      const [enabledPlan] = await db
        .select()
        .from(opsScheduledJobs)
        .where(eq(opsScheduledJobs.taskKey, taskKey))
      expect(enabledPlan?.activeRunId).toBe(runId)
      expect(scheduler.wake).toHaveBeenCalledTimes(2)
      expect(events.map(({ action, httpStatus }) => ({ action, httpStatus }))).toEqual([
        { action: 'ops:scheduled-job:disable', httpStatus: 200 },
        { action: 'ops:scheduled-job:enable', httpStatus: 200 },
      ])
    },
  )

  dbTest('returns exact overlap conflict and records failed execute operation', async ({ db }) => {
    const operator = await createSystemAccessFixture(db, {
      accessCodes: ['ops:scheduled-job:execute'],
      usernamePrefix: 'scheduled-job-overlap',
    })
    const skippedRunId = '20000000-0000-4000-8000-000000000011'
    const activeRunId = '20000000-0000-4000-8000-000000000012'
    const scheduler = createScheduler()
    scheduler.runManual.mockResolvedValue({
      runId: skippedRunId,
      blockedByRunId: activeRunId,
      scheduledFor: null,
    })
    const events: OperationLogEvent[] = []
    const app = createApp(db, {
      scheduledJobService: createTestScheduledJobService(db, scheduler),
      operationLogReceiver: receiver(events),
    })

    const response = await app.request(`/api/ops/scheduled-jobs/${taskKey}/runs`, {
      method: 'POST',
      headers: operator.authHeaders,
    })
    expect(response.status).toBe(409)
    expect(scheduledJobManualExecuteOverlapResponseSchema.parse(await response.json())).toEqual({
      skippedRunId,
      activeRunId,
    })
    expect(events[0]).toMatchObject({
      action: 'ops:scheduled-job:execute',
      targetKey: taskKey,
      result: 'failure',
      httpStatus: 409,
    })
  })

  dbTest('returns stable secure run pages and a complete exact-match detail', async ({ db }) => {
    const reader = await createSystemAccessFixture(db, {
      accessCodes: ['ops:scheduled-job:list'],
      usernamePrefix: 'scheduled-job-run-reader',
    })
    const firstRunId = '10000000-0000-4000-8000-000000000021'
    const secondRunId = 'ffffffff-ffff-4fff-bfff-ffffffffffff'
    const sameCreatedAt = new Date('2026-08-25T00:00:00.000Z')
    const userId = '40000000-0000-4000-8000-000000000021'
    await db.insert(opsJobRuns).values([
      {
        id: firstRunId,
        taskKey,
        triggerSource: 'scheduled',
        status: 'success',
        scheduledFor: sameCreatedAt,
        startedAt: sameCreatedAt,
        finishedAt: new Date('2026-08-25T00:00:01.000Z'),
        durationMs: 1000,
        deletedCount: 1,
        failedCount: 0,
        createdAt: sameCreatedAt,
      },
      {
        id: secondRunId,
        taskKey,
        triggerSource: 'manual',
        status: 'cancelled',
        deletedCount: 0,
        failedCount: 0,
        triggeredByUserId: userId,
        triggeredByUsername: 'detail-user',
        triggeredByNickname: 'Detail User',
        cancelRequestedAt: new Date('2026-08-25T00:00:02.000Z'),
        cancelRequestedByUserId: userId,
        cancelRequestedByUsername: 'detail-user',
        cancelRequestedByNickname: 'Detail User',
        startedAt: sameCreatedAt,
        finishedAt: new Date('2026-08-25T00:00:03.000Z'),
        durationMs: 3000,
        createdAt: sameCreatedAt,
      },
    ])
    const scheduler = createScheduler()
    const app = createApp(db, {
      scheduledJobService: createTestScheduledJobService(db, scheduler),
    })
    const firstPageResponse = await app.request(
      `/api/ops/scheduled-jobs/${taskKey}/runs?page=1&pageSize=1`,
      { headers: reader.authHeaders },
    )
    const firstPage = scheduledJobRunListResponseSchema.parse(await firstPageResponse.json())
    expect(firstPageResponse.status).toBe(200)
    expect(firstPage).toMatchObject({ total: 2, page: 1, pageSize: 1 })
    expect(firstPage.list[0]?.id).toBe(secondRunId)
    expect(firstPage.list[0]).not.toHaveProperty('triggeredByUserId')
    expect(firstPage.list[0]).not.toHaveProperty('cancelRequestedAt')

    const secondPageResponse = await app.request(
      `/api/ops/scheduled-jobs/${taskKey}/runs?page=2&pageSize=1`,
      { headers: reader.authHeaders },
    )
    const secondPage = scheduledJobRunListResponseSchema.parse(await secondPageResponse.json())
    expect(secondPage.list[0]?.id).toBe(firstRunId)

    const detailResponse = await app.request(
      `/api/ops/scheduled-jobs/${taskKey}/runs/${secondRunId}`,
      { headers: reader.authHeaders },
    )
    expect(detailResponse.status).toBe(200)
    const detail = scheduledJobRunDetailSchema.parse(await detailResponse.json())
    expect(detail).toMatchObject({
      id: secondRunId,
      taskKey,
      triggeredByUserId: userId,
      cancelRequestedByUserId: userId,
    })

    const mismatchResponse = await app.request(
      `/api/ops/scheduled-jobs/${scheduledJobTaskKeys[1]}/runs/${secondRunId}`,
      { headers: reader.authHeaders },
    )
    expect(mismatchResponse.status).toBe(404)
  })

  dbTest('accepts repeated cancellation and preserves the first actor snapshot', async ({ db }) => {
    const operator = await createSystemAccessFixture(db, {
      accessCodes: ['ops:scheduled-job:cancel'],
      usernamePrefix: 'scheduled-job-canceller',
    })
    const cancelRunId = '20000000-0000-4000-8000-000000000003'
    const startedAt = new Date('2026-08-25T00:00:01.000Z')
    const cancelRequestedAt = new Date('2026-08-25T00:00:02.000Z')
    await db.insert(opsJobRuns).values({
      id: cancelRunId,
      taskKey,
      triggerSource: 'scheduled',
      status: 'running',
      scheduledFor: new Date('2026-08-25T00:00:00.000Z'),
      startedAt,
      cancelRequestedAt,
      cancelRequestedByUserId: operator.userId,
      cancelRequestedByUsername: 'first-operator',
      cancelRequestedByNickname: 'First Operator',
      createdAt: startedAt,
    })
    await db
      .update(opsScheduledJobs)
      .set({ activeRunId: cancelRunId })
      .where(eq(opsScheduledJobs.taskKey, taskKey))
    const run = (await db.select().from(opsJobRuns).where(eq(opsJobRuns.id, cancelRunId)))[0]!
    const scheduler = createScheduler()
    scheduler.requestCancellation.mockResolvedValue(run)
    const events: OperationLogEvent[] = []
    const app = createApp(db, {
      scheduledJobService: createTestScheduledJobService(db, scheduler),
      operationLogReceiver: receiver(events),
    })

    const response = await app.request(
      `/api/ops/scheduled-jobs/${taskKey}/runs/${cancelRunId}/cancel`,
      {
        method: 'POST',
        headers: operator.authHeaders,
      },
    )

    expect(response.status).toBe(202)
    expect(scheduledJobCancelResponseSchema.parse(await response.json())).toMatchObject({
      run: {
        id: cancelRunId,
        status: 'running',
        cancelRequestedAt: cancelRequestedAt.toISOString(),
      },
    })
    expect(scheduler.requestCancellation).toHaveBeenCalledWith({
      taskKey,
      runId: cancelRunId,
      actor: expect.objectContaining({
        id: operator.userId,
        username: expect.any(String),
        nickname: expect.any(String),
      }),
    })
    expect(events[0]).toMatchObject({
      action: 'ops:scheduled-job:cancel',
      targetKey: taskKey,
      targetLabel: cancelRunId,
      httpStatus: 202,
    })
  })

  dbTest(
    'maps terminal, non-current, and unknown cancellation outcomes to failed logs',
    async ({ db }) => {
      const operator = await createSystemAccessFixture(db, {
        accessCodes: ['ops:scheduled-job:cancel'],
        usernamePrefix: 'scheduled-job-cancel-errors',
      })
      const terminalId = '20000000-0000-4000-8000-000000000031'
      const nonCurrentId = '20000000-0000-4000-8000-000000000032'
      const unknownId = '20000000-0000-4000-8000-000000000033'
      const scheduler = createScheduler()
      scheduler.requestCancellation
        .mockRejectedValueOnce(new ScheduledJobStateConflictError())
        .mockRejectedValueOnce(new ScheduledJobStateConflictError())
        .mockRejectedValueOnce(new ScheduledJobNotFoundError())
      const events: OperationLogEvent[] = []
      const app = createApp(db, {
        scheduledJobService: createTestScheduledJobService(db, scheduler),
        operationLogReceiver: receiver(events),
      })

      for (const runId of [terminalId, nonCurrentId, unknownId]) {
        const response = await app.request(
          `/api/ops/scheduled-jobs/${taskKey}/runs/${runId}/cancel`,
          { method: 'POST', headers: operator.authHeaders },
        )
        expect(response.status).toBe(runId === unknownId ? 404 : 409)
      }
      expect(
        events.map(({ action, result, httpStatus, targetLabel }) => ({
          action,
          result,
          httpStatus,
          targetLabel,
        })),
      ).toEqual([
        {
          action: 'ops:scheduled-job:cancel',
          result: 'failure',
          httpStatus: 409,
          targetLabel: terminalId,
        },
        {
          action: 'ops:scheduled-job:cancel',
          result: 'failure',
          httpStatus: 409,
          targetLabel: nonCurrentId,
        },
        {
          action: 'ops:scheduled-job:cancel',
          result: 'failure',
          httpStatus: 404,
          targetLabel: unknownId,
        },
      ])
    },
  )
})
