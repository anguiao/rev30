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
} from '../../../src/features/scheduled-jobs/requests'
import { createFetchMock, expectFetchCall, expectJsonBody, jsonResponse } from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const taskKey = 'auth-session-cleanup' as const
const runId = '11111111-1111-4111-8111-111111111111'
const userId = '33333333-3333-4333-8333-333333333333'

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
  scheduledFor: null,
  deletedCount: 4,
  failedCount: 0,
  errorCategory: null,
  errorSummary: null,
  triggeredByUserId: userId,
  triggeredByUsername: 'ada',
  triggeredByNickname: 'Ada Lovelace',
  cancelRequestedAt: null,
  cancelRequestedByUserId: null,
  cancelRequestedByUsername: null,
  cancelRequestedByNickname: null,
  startedAt: '2026-08-25T04:00:00.000Z',
  finishedAt: '2026-08-25T04:00:01.000Z',
  durationMs: 1000,
  createdAt: '2026-08-25T04:00:00.000Z',
}

const runs: ScheduledJobRunListResponse = {
  list: [
    {
      id: run.id,
      taskKey: run.taskKey,
      triggerSource: run.triggerSource,
      status: run.status,
      scheduledFor: run.scheduledFor,
      deletedCount: run.deletedCount,
      failedCount: run.failedCount,
      errorCategory: run.errorCategory,
      errorSummary: run.errorSummary,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
      createdAt: run.createdAt,
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
  it('lists scheduled jobs', async () => {
    const fetchMock = createFetchMock(jsonResponse([job]))

    await expect(listScheduledJobs()).resolves.toEqual([job])

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/ops/scheduled-jobs',
    })
  })

  it('loads scheduled job details', async () => {
    const fetchMock = createFetchMock(jsonResponse(jobDetail))

    await expect(getScheduledJob(taskKey)).resolves.toEqual(jobDetail)

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/ops/scheduled-jobs/${taskKey}`,
    })
  })

  it('trims schedule settings before updating a job', async () => {
    const fetchMock = createFetchMock(jsonResponse(jobDetail))

    await expect(
      updateScheduledJob(taskKey, {
        cronExpression: ' 2   */6 * * * ',
        timezone: ' Asia/Shanghai ',
      }),
    ).resolves.toEqual(jobDetail)

    expectFetchCall(fetchMock, 0, {
      method: 'PUT',
      pathname: `/api/ops/scheduled-jobs/${taskKey}`,
    })
    expectJsonBody(fetchMock, 0, {
      cronExpression: '2   */6 * * *',
      timezone: 'Asia/Shanghai',
    })
  })

  it('updates the enabled state', async () => {
    const disabledJob = { ...jobDetail, enabled: false }
    const fetchMock = createFetchMock(jsonResponse(disabledJob))

    await expect(updateScheduledJobEnabled(taskKey, false)).resolves.toEqual(disabledJob)

    expectFetchCall(fetchMock, 0, {
      method: 'PUT',
      pathname: `/api/ops/scheduled-jobs/${taskKey}/enabled`,
    })
    expectJsonBody(fetchMock, 0, { enabled: false })
  })

  it('starts a manual run', async () => {
    const fetchMock = createFetchMock(jsonResponse({ runId }, { status: 202 }))

    await expect(executeScheduledJob(taskKey)).resolves.toEqual({ runId })

    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: `/api/ops/scheduled-jobs/${taskKey}/runs`,
    })
  })

  it('lists runs with pagination', async () => {
    const fetchMock = createFetchMock(jsonResponse(runs))

    await expect(listScheduledJobRuns(taskKey, { page: 1, pageSize: 20 })).resolves.toEqual(runs)

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/ops/scheduled-jobs/${taskKey}/runs`,
      query: { page: '1', pageSize: '20' },
    })
  })

  it('loads a run detail', async () => {
    const fetchMock = createFetchMock(jsonResponse(run))

    await expect(getScheduledJobRun(taskKey, runId)).resolves.toEqual(run)

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/ops/scheduled-jobs/${taskKey}/runs/${runId}`,
    })
  })

  it('requests cancellation of the specified run', async () => {
    const fetchMock = createFetchMock(
      jsonResponse(
        {
          run: {
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

    await expect(cancelScheduledJob(taskKey, runId)).resolves.toMatchObject({ run: { id: runId } })

    expectFetchCall(fetchMock, 0, {
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
