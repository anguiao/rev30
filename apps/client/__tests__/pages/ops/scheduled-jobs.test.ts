import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NInput, NPagination, NSelect } from 'naive-ui'
import type { ScheduledJobListResponse } from '@rev30/contracts'
import ScheduledJobsPage from '../../../src/pages/index/ops/scheduled-jobs.vue'
import {
  cancelScheduledJob,
  executeScheduledJob,
  getScheduledJobRun,
  listScheduledJobRuns,
  listScheduledJobs,
  updateScheduledJobEnabled,
} from '../../../src/features/ops'
import {
  getScheduledJobRun as getScheduledJobRunRequest,
  listScheduledJobRuns as listScheduledJobRunsRequest,
  updateScheduledJob as updateScheduledJobRequest,
} from '../../../src/features/ops/requests'
import { mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'

vi.mock('../../../src/features/ops', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/ops')>()),
  executeScheduledJob: vi.fn(),
  cancelScheduledJob: vi.fn(),
  getScheduledJobRun: vi.fn(),
  listScheduledJobs: vi.fn(),
  listScheduledJobRuns: vi.fn(),
  updateScheduledJobEnabled: vi.fn(),
}))
vi.mock('../../../src/features/ops/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/ops/requests')>()),
  getScheduledJobRun: vi.fn(),
  listScheduledJobRuns: vi.fn(),
  updateScheduledJob: vi.fn(),
}))

const listMock = vi.mocked(listScheduledJobs)
const executeMock = vi.mocked(executeScheduledJob)
const cancelMock = vi.mocked(cancelScheduledJob)
const listRunsMock = vi.mocked(listScheduledJobRuns)
const getRunMock = vi.mocked(getScheduledJobRun)
const enabledMock = vi.mocked(updateScheduledJobEnabled)
const listRunsRequestMock = vi.mocked(listScheduledJobRunsRequest)
const getRunRequestMock = vi.mocked(getScheduledJobRunRequest)
const updateRequestMock = vi.mocked(updateScheduledJobRequest)

const runId = '11111111-1111-4111-8111-111111111111'
const executorId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const sessionId = '44444444-4444-4444-8444-444444444444'
const requestId = '55555555-5555-4555-8555-555555555555'
const activeRunId = '66666666-6666-4666-8666-666666666666'

const response: ScheduledJobListResponse = [
  {
    taskKey: 'auth-session-cleanup',
    name: '认证会话清理',
    description: '清理过期认证会话',
    cronExpression: '2 */6 * * *',
    timezone: 'Asia/Shanghai',
    enabled: true,
    nextRunAt: '2026-08-25T04:02:00.000Z',
    currentRun: {
      id: runId,
      triggerSource: 'manual',
      status: 'running',
      scheduledFor: null,
      startedAt: '2026-08-25T04:00:00.000Z',
      finishedAt: null,
      durationMs: null,
      cancelRequestedAt: null,
    },
    lastRun: {
      id: '66666666-6666-4666-8666-666666666666',
      triggerSource: 'scheduled',
      status: 'success',
      scheduledFor: '2026-08-25T03:00:00.000Z',
      startedAt: '2026-08-25T03:00:00.000Z',
      finishedAt: '2026-08-25T03:00:01.000Z',
      durationMs: 1000,
      cancelRequestedAt: null,
    },
  },
]

const idleResponse: ScheduledJobListResponse = [{ ...response[0]!, currentRun: null }]

const detail = {
  id: runId,
  taskKey: 'auth-session-cleanup' as const,
  triggerSource: 'manual' as const,
  status: 'running' as const,
  skipReason: null,
  scheduledFor: null,
  executorId,
  deletedCount: null,
  failedCount: null,
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
  finishedAt: null,
  durationMs: null,
  createdAt: '2026-08-25T04:00:00.000Z',
  updatedAt: '2026-08-25T04:00:00.000Z',
}

const completedDetail = {
  ...detail,
  status: 'success' as const,
  deletedCount: 4,
  failedCount: 0,
  finishedAt: '2026-08-25T04:00:01.000Z',
  durationMs: 1000,
  updatedAt: '2026-08-25T04:00:01.000Z',
}

const publicRun = {
  id: detail.id,
  taskKey: detail.taskKey,
  triggerSource: detail.triggerSource,
  status: detail.status,
  skipReason: detail.skipReason,
  scheduledFor: detail.scheduledFor,
  executorId: detail.executorId,
  deletedCount: detail.deletedCount,
  failedCount: detail.failedCount,
  errorCategory: detail.errorCategory,
  errorSummary: detail.errorSummary,
  startedAt: detail.startedAt,
  finishedAt: detail.finishedAt,
  durationMs: detail.durationMs,
  createdAt: detail.createdAt,
  updatedAt: detail.updatedAt,
}

const completedPublicRun = {
  ...publicRun,
  status: completedDetail.status,
  deletedCount: completedDetail.deletedCount,
  failedCount: completedDetail.failedCount,
  finishedAt: completedDetail.finishedAt,
  durationMs: completedDetail.durationMs,
  updatedAt: completedDetail.updatedAt,
}

async function mountPage(
  accessCodes = ['ops:scheduled-job:list', 'ops:scheduled-job:update', 'ops:scheduled-job:execute'],
) {
  return mountAuthRoute(
    '/ops/scheduled-jobs',
    [{ path: '/ops/scheduled-jobs', component: ScheduledJobsPage }],
    { ...session, accessCodes },
  )
}

describe('scheduled jobs page', () => {
  beforeEach(() => {
    listMock.mockReset()
    executeMock.mockReset()
    cancelMock.mockReset()
    listRunsMock.mockReset()
    getRunMock.mockReset()
    enabledMock.mockReset()
    listRunsRequestMock.mockReset()
    getRunRequestMock.mockReset()
    updateRequestMock.mockReset()
    listMock.mockResolvedValue(response)
    executeMock.mockResolvedValue({ runId })
    cancelMock.mockResolvedValue({ run: response[0]!.currentRun! })
    enabledMock.mockResolvedValue(response[0]!)
    listRunsMock.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 10 })
    getRunMock.mockResolvedValue(detail)
    listRunsRequestMock.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 10 })
    getRunRequestMock.mockResolvedValue(detail)
    updateRequestMock.mockResolvedValue(response[0]!)
    stubPreferredDark(false)
  })

  it('renders current and latest states and keeps each permission independent', async () => {
    const { wrapper } = await mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('认证会话清理')
    expect(wrapper.text()).toContain('auth-session-cleanup')
    expect(wrapper.text()).toContain('2 */6 * * *')
    expect(wrapper.text()).toContain('Asia/Shanghai')
    expect(wrapper.text()).toContain('运行中')
    expect(wrapper.text()).toContain('成功')
    expect(wrapper.findAll('[data-test="scheduled-job-edit"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-test="scheduled-job-execute"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-test="scheduled-job-cancel"]')).toHaveLength(0)
  })

  it('formats the next run in the configured task timezone', async () => {
    listMock.mockResolvedValue([
      {
        ...idleResponse[0]!,
        timezone: 'America/New_York',
        nextRunAt: '2026-08-25T04:02:00.000Z',
      },
    ])
    const { wrapper } = await mountPage(['ops:scheduled-job:list'])
    await flushPromises()

    expect(wrapper.text()).toContain('2026/08/25 00:02')
    expect(wrapper.text()).toContain('America/New_York')
  })

  it('filters locally and uses query as the explicit list refresh', async () => {
    const secondJob: ScheduledJobListResponse[number] = {
      ...idleResponse[0]!,
      taskKey: 'auth-login-attempt-cleanup',
      name: '登录尝试清理',
      description: '清理过期登录尝试',
    }
    listMock.mockResolvedValue([idleResponse[0]!, secondJob])
    const { wrapper } = await mountPage(['ops:scheduled-job:list'])
    await flushPromises()

    expect(wrapper.text()).toContain('共 2 个')
    expect(wrapper.find('[data-test="scheduled-jobs-refresh"]').exists()).toBe(false)

    await wrapper.get('[data-test="scheduled-jobs-keyword"] input').setValue('登录尝试')
    await wrapper.get('[data-test="scheduled-jobs-search"]').trigger('click')
    await flushPromises()

    expect(listMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('共 1 个')
    expect(wrapper.text()).toContain('auth-login-attempt-cleanup')
    expect(wrapper.text()).not.toContain('auth-session-cleanup')

    await wrapper.get('[data-test="scheduled-jobs-reset"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('共 2 个')
    expect(wrapper.text()).toContain('auth-session-cleanup')
    expect(listMock).toHaveBeenCalledTimes(2)
  })

  it('submits a manual run, opens its log detail, and starts focused polling', async () => {
    vi.useFakeTimers()
    let wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'] | undefined
    try {
      listMock.mockResolvedValue(idleResponse)
      const mounted = await mountPage()
      wrapper = mounted.wrapper
      await flushPromises()

      await wrapper.get('[data-test="scheduled-job-execute"]').trigger('click')
      await flushPromises()

      expect(executeMock).not.toHaveBeenCalled()
      expect(document.body.textContent).toContain('可能删除符合条件的数据')
      document
        .querySelector<HTMLButtonElement>('[data-test="scheduled-job-execute-confirm"]')
        ?.click()
      await flushPromises()

      expect(executeMock).toHaveBeenCalledWith('auth-session-cleanup')
      await vi.waitFor(() => {
        expect(listRunsRequestMock).toHaveBeenCalledWith(
          'auth-session-cleanup',
          {
            page: 1,
            pageSize: 10,
          },
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        )
        expect(getRunRequestMock).toHaveBeenCalledWith(
          'auth-session-cleanup',
          runId,
          expect.anything(),
        )
      })

      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      expect(getRunRequestMock.mock.calls.length).toBeGreaterThanOrEqual(2)
      getRunRequestMock.mockResolvedValue(completedDetail)
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      const completedCallCount = getRunRequestMock.mock.calls.length
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      expect(getRunRequestMock.mock.calls.length).toBe(completedCallCount)
      expect(listRunsRequestMock.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(listMock.mock.calls.length).toBeGreaterThanOrEqual(3)
    } finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('shows the edit drawer preview and rejects an unsupported shortcut before saving', async () => {
    const { wrapper } = await mountPage()
    await flushPromises()

    await wrapper.get('[data-test="scheduled-job-edit"]').trigger('click')
    await flushPromises()

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('未来五次执行预览')
    })
    const editDrawer = document.querySelector('[data-test="scheduled-job-edit-drawer"]')
    expect(editDrawer?.textContent).toContain('编辑定时任务')
    expect(editDrawer?.textContent).not.toContain('编辑：')
    const editContext = document.querySelector('[data-test="scheduled-job-edit-context"]')
    expect(editContext?.textContent).toContain('当前任务：认证会话清理')
    expect(editContext?.textContent).not.toContain('auth-session-cleanup')
    expect(document.body.textContent).toContain('标准五段 Cron')
    const timezoneOptions = wrapper.findComponent(NSelect).props('options') as
      | Array<{ value?: string | number }>
      | undefined
    expect(timezoneOptions?.some((option) => option.value === 'UTC')).toBe(true)
    expect(document.querySelectorAll('[data-test="scheduled-job-cron-input"]')).toHaveLength(1)

    const input = wrapper
      .findAllComponents(NInput)
      .find((component) => component.attributes('data-test') === 'scheduled-job-cron-input')
    expect(input).toBeDefined()
    input!.vm.$emit('update:value', '@daily')
    await flushPromises()

    expect(document.body.textContent).toContain('Cron 表达式')
    expect(
      document.querySelector('[data-test="scheduled-job-save"]')?.hasAttribute('disabled'),
    ).toBe(true)

    const editCancelButton = document.querySelector<HTMLButtonElement>(
      '[data-test="scheduled-job-edit-cancel"]',
    )
    expect(editCancelButton).not.toBeNull()
    editCancelButton!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('放弃未保存的更改？')
    document
      .querySelector<HTMLButtonElement>('[data-test="unsaved-changes-discard-cancel"]')
      ?.click()
    await flushPromises()
    expect(document.querySelector('[data-test="scheduled-job-cron-input"]')).not.toBeNull()
  })

  it('refreshes after enable/disable and plan save', async () => {
    const { wrapper } = await mountPage(['ops:scheduled-job:list', 'ops:scheduled-job:update'])
    await flushPromises()

    await wrapper.get('[data-test="scheduled-job-disable"]').trigger('click')
    await flushPromises()
    expect(enabledMock).toHaveBeenCalledWith('auth-session-cleanup', false)
    expect(listMock).toHaveBeenCalledTimes(2)

    await wrapper.get('[data-test="scheduled-job-edit"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="scheduled-job-save"]')).not.toBeNull()
    })
    document.querySelector<HTMLButtonElement>('[data-test="scheduled-job-save"]')!.click()
    await flushPromises()
    expect(updateRequestMock).toHaveBeenCalledWith('auth-session-cleanup', {
      cronExpression: '2 */6 * * *',
      timezone: 'Asia/Shanghai',
    })
    expect(listMock).toHaveBeenCalledTimes(3)
  })

  it('tracks pending commands independently for each task', async () => {
    const secondJob: ScheduledJobListResponse[number] = {
      ...idleResponse[0]!,
      taskKey: 'auth-login-attempt-cleanup',
      name: '登录尝试清理',
      description: '清理过期登录尝试',
    }
    listMock.mockResolvedValue([idleResponse[0]!, secondJob])
    let resolveFirst!: (value: ScheduledJobListResponse[number]) => void
    enabledMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce(secondJob)
    const { wrapper } = await mountPage(['ops:scheduled-job:list', 'ops:scheduled-job:update'])
    await flushPromises()

    let disableButtons = wrapper.findAll('[data-test="scheduled-job-disable"]')
    await disableButtons[0]!.trigger('click')
    await flushPromises()
    disableButtons = wrapper.findAll('[data-test="scheduled-job-disable"]')
    expect(disableButtons[0]!.attributes('disabled')).toBeDefined()
    expect(disableButtons[1]!.attributes('disabled')).toBeUndefined()

    await disableButtons[1]!.trigger('click')
    await flushPromises()
    disableButtons = wrapper.findAll('[data-test="scheduled-job-disable"]')
    expect(disableButtons[0]!.attributes('disabled')).toBeDefined()

    resolveFirst(idleResponse[0]!)
    await flushPromises()
    disableButtons = wrapper.findAll('[data-test="scheduled-job-disable"]')
    expect(disableButtons[0]!.attributes('disabled')).toBeUndefined()
  })

  it('shows the overlap active run and refreshes once for a 409 command result', async () => {
    executeMock.mockResolvedValue({
      skippedRunId: runId,
      activeRunId,
    })
    listMock.mockResolvedValue(idleResponse)
    getRunRequestMock.mockResolvedValue({ ...detail, id: activeRunId })
    const { wrapper } = await mountPage(['ops:scheduled-job:list', 'ops:scheduled-job:execute'])
    await flushPromises()

    await wrapper.get('[data-test="scheduled-job-execute"]').trigger('click')
    await flushPromises()
    document
      .querySelector<HTMLButtonElement>('[data-test="scheduled-job-execute-confirm"]')
      ?.click()
    await flushPromises()

    expect(listMock).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('任务已有运行中的实例')
    await vi.waitFor(() => {
      expect(getRunRequestMock).toHaveBeenCalledWith(
        'auth-session-cleanup',
        activeRunId,
        expect.anything(),
      )
    })
  })

  it('shows cancel-in-progress after a 202 cancel and keeps the focused run under polling', async () => {
    vi.useFakeTimers()
    const cancelRequestedRun = {
      ...response[0]!.currentRun!,
      cancelRequestedAt: '2026-08-25T04:00:00.500Z',
    }
    listMock
      .mockResolvedValueOnce(response)
      .mockResolvedValue([{ ...response[0]!, currentRun: cancelRequestedRun }])
    cancelMock.mockResolvedValue({ run: cancelRequestedRun })
    let wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'] | undefined
    try {
      const mounted = await mountPage(['ops:scheduled-job:list', 'ops:scheduled-job:cancel'])
      wrapper = mounted.wrapper
      await flushPromises()

      await wrapper.get('[data-test="scheduled-job-cancel"]').trigger('click')
      await flushPromises()
      document
        .querySelector<HTMLButtonElement>('[data-test="scheduled-job-cancel-confirm"]')
        ?.click()
      await flushPromises()

      expect(cancelMock).toHaveBeenCalledWith('auth-session-cleanup', runId)
      expect(listMock).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('取消中')
      expect(wrapper.findAll('[data-test="scheduled-job-cancel"]')).toHaveLength(0)
      await vi.waitFor(() => {
        expect(getRunRequestMock).toHaveBeenCalledWith(
          'auth-session-cleanup',
          runId,
          expect.anything(),
        )
      })
    } finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('keeps pagination independent from detail and aborts unfinished requests on unmount', async () => {
    const { wrapper } = await mountPage(['ops:scheduled-job:list'])
    await flushPromises()
    listRunsRequestMock.mockResolvedValue({
      list: [completedPublicRun],
      total: 11,
      page: 1,
      pageSize: 10,
    })

    await wrapper.get('[data-test="scheduled-job-logs"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => {
      expect(listRunsRequestMock).toHaveBeenCalledWith(
        'auth-session-cleanup',
        {
          page: 1,
          pageSize: 10,
        },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })
    const runLogDrawer = document.querySelector('[data-test="scheduled-job-run-log-drawer"]')
    expect(runLogDrawer?.textContent).toContain('定时任务日志')
    expect(runLogDrawer?.textContent).not.toContain('运行日志：')
    const runContext = document.querySelector('[data-test="scheduled-job-run-context"]')
    expect(runContext?.textContent).toContain('当前任务：认证会话清理')
    expect(runContext?.textContent).not.toContain('auth-session-cleanup')
    getRunRequestMock.mockResolvedValue(completedDetail)
    document.querySelector<HTMLButtonElement>('[data-test="scheduled-job-run-view"]')?.click()
    await flushPromises()
    expect(document.body.textContent).toContain('Ada Lovelace')
    expect(document.body.textContent).toContain(requestId)
    expect(document.body.textContent).toContain('成功')
    expect(runLogDrawer?.textContent).toContain('定时任务日志')
    expect(runLogDrawer?.textContent).not.toContain('运行详情：')
    expect(document.querySelector('[data-test="scheduled-job-run-back"]')).not.toBeNull()

    document.querySelector<HTMLButtonElement>('[data-test="scheduled-job-run-back"]')?.click()
    await flushPromises()

    let listSignal: AbortSignal | undefined
    listRunsRequestMock.mockImplementation((_taskKey, _query, options) => {
      listSignal = options?.signal
      return new Promise(() => {})
    })
    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()
    expect(listRunsRequestMock).toHaveBeenLastCalledWith(
      'auth-session-cleanup',
      {
        page: 2,
        pageSize: 10,
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )

    let signal: AbortSignal | undefined
    getRunRequestMock.mockImplementation((_taskKey, _runId, options) => {
      signal = options?.signal
      return new Promise(() => {})
    })
    document.querySelector<HTMLButtonElement>('[data-test="scheduled-job-run-view"]')?.click()
    await flushPromises()
    expect(listSignal?.aborted).toBe(false)
    wrapper.unmount()
    expect(listSignal?.aborted).toBe(true)
    expect(signal?.aborted).toBe(true)
  })

  it('does not render cancel when a task has no current running record', async () => {
    listMock.mockResolvedValue([{ ...response[0]!, currentRun: null }])
    const { wrapper } = await mountPage(['ops:scheduled-job:list', 'ops:scheduled-job:cancel'])
    await flushPromises()

    expect(wrapper.findAll('[data-test="scheduled-job-cancel"]')).toHaveLength(0)
  })
})
