import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ScheduledJob,
  ScheduledJobListResponse,
  ScheduledJobRunDetail,
  ScheduledJobRunListResponse,
} from '@rev30/contracts'
import { useAuthStore } from '../../../src/stores/auth'
import {
  cancelScheduledJob,
  executeScheduledJob,
  getScheduledJob,
  getScheduledJobRun,
  listScheduledJobRuns,
  listScheduledJobs,
  updateScheduledJob,
  updateScheduledJobEnabled,
} from '../../../src/features/ops'
import { createFetchMock, expectFetchCall, expectJsonBody, jsonResponse } from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const taskKey = 'auth-session-cleanup' as const
const runId = '11111111-1111-4111-8111-111111111111'
const executorId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const sessionId = '44444444-4444-4444-8444-444444444444'
const requestId = '55555555-5555-4555-8555-555555555555'

const job: ScheduledJobListResponse[number] = {
  taskKey,
  name: '认证会话清理',
  description: '清理过期认证会话',
  cronExpression: '2 */6 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  nextRunAt: '2026-08-25T04:02:00.000Z',
  currentRun: null,
  lastRun: null,
}

const jobDetail: ScheduledJob = {
  taskKey: job.taskKey,
  name: job.name,
  description: job.description,
  cronExpression: job.cronExpression,
  timezone: job.timezone,
  enabled: job.enabled,
  nextRunAt: job.nextRunAt,
}

const run: ScheduledJobRunDetail = {
  id: runId,
  taskKey,
  triggerSource: 'manual',
  status: 'success',
  skipReason: null,
  scheduledFor: null,
  executorId,
  deletedCount: 4,
  failedCount: 0,
  errorCategory: null,
  errorSummary: null,
  triggeredByUserId: userId,
  triggeredByUsername: 'ada',
  triggeredByNickname: 'Ada Lovelace',
  triggeredBySessionId: sessionId,
  triggerRequestId: requestId,
  cancelRequestedAt: null,
  cancelRequestedByUserId: null,
  cancelRequestedByUsername: null,
  cancelRequestedByNickname: null,
  cancelRequestedBySessionId: null,
  cancelRequestId: null,
  startedAt: '2026-08-25T04:00:00.000Z',
  finishedAt: '2026-08-25T04:00:01.000Z',
  durationMs: 1000,
  createdAt: '2026-08-25T04:00:00.000Z',
  updatedAt: '2026-08-25T04:00:01.000Z',
}

const runs: ScheduledJobRunListResponse = {
  list: [
    {
      id: run.id,
      taskKey: run.taskKey,
      triggerSource: run.triggerSource,
      status: run.status,
      skipReason: run.skipReason,
      scheduledFor: run.scheduledFor,
      executorId: run.executorId,
      deletedCount: run.deletedCount,
      failedCount: run.failedCount,
      errorCategory: run.errorCategory,
      errorSummary: run.errorSummary,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

beforeEach(() => {
  const pinia = createTestPinia()
  useAuthStore(pinia).accessToken = 'access-token'
})

describe('scheduled jobs requests', () => {
  it('uses the scheduled jobs API contracts for reads and writes', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([job]),
      jsonResponse(jobDetail),
      jsonResponse(jobDetail),
      jsonResponse(jobDetail),
      jsonResponse({ runId }, { status: 202 }),
      jsonResponse(runs),
      jsonResponse(run),
      jsonResponse(
        {
          run: {
            ...job.currentRun,
            id: runId,
            status: 'running',
            triggerSource: 'manual',
            scheduledFor: null,
            startedAt: run.startedAt,
            finishedAt: null,
            durationMs: null,
            cancelRequestedAt: '2026-08-25T04:00:00.500Z',
          },
        },
        { status: 202 },
      ),
    )

    await expect(listScheduledJobs()).resolves.toEqual([job])
    await expect(getScheduledJob(taskKey)).resolves.toEqual(jobDetail)
    await expect(
      updateScheduledJob(taskKey, {
        cronExpression: ' 2   */6 * * * ',
        timezone: ' Asia/Shanghai ',
      }),
    ).resolves.toEqual(jobDetail)
    await expect(updateScheduledJobEnabled(taskKey, false)).resolves.toEqual(jobDetail)
    await expect(executeScheduledJob(taskKey)).resolves.toEqual({ runId })
    await expect(listScheduledJobRuns(taskKey, { page: 1, pageSize: 20 })).resolves.toEqual(runs)
    await expect(getScheduledJobRun(taskKey, runId)).resolves.toEqual(run)
    await expect(cancelScheduledJob(taskKey, runId)).resolves.toMatchObject({ run: { id: runId } })

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/ops/scheduled-jobs',
    })
    expectFetchCall(fetchMock, 1, {
      method: 'GET',
      pathname: `/api/ops/scheduled-jobs/${taskKey}`,
    })
    expectFetchCall(fetchMock, 2, {
      method: 'PUT',
      pathname: `/api/ops/scheduled-jobs/${taskKey}`,
    })
    expectJsonBody(fetchMock, 2, {
      cronExpression: '2   */6 * * *',
      timezone: 'Asia/Shanghai',
    })
    expectFetchCall(fetchMock, 3, {
      method: 'PUT',
      pathname: `/api/ops/scheduled-jobs/${taskKey}/enabled`,
    })
    expectJsonBody(fetchMock, 3, { enabled: false })
    expectFetchCall(fetchMock, 4, {
      method: 'POST',
      pathname: `/api/ops/scheduled-jobs/${taskKey}/runs`,
    })
    expectFetchCall(fetchMock, 5, {
      method: 'GET',
      pathname: `/api/ops/scheduled-jobs/${taskKey}/runs`,
      query: { page: '1', pageSize: '20' },
    })
    expectFetchCall(fetchMock, 6, {
      method: 'GET',
      pathname: `/api/ops/scheduled-jobs/${taskKey}/runs/${runId}`,
    })
    expectFetchCall(fetchMock, 7, {
      method: 'POST',
      pathname: `/api/ops/scheduled-jobs/${taskKey}/runs/${runId}/cancel`,
    })
  })

  it('preserves the overlap identifiers from a 409 response', async () => {
    const activeRunId = '66666666-6666-4666-8666-666666666666'
    createFetchMock(
      jsonResponse(
        {
          skippedRunId: runId,
          activeRunId,
        },
        { status: 409 },
      ),
    )

    await expect(executeScheduledJob(taskKey)).resolves.toEqual({
      skippedRunId: runId,
      activeRunId,
    })
  })
})
