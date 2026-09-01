import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NInput, NPagination, NSelect } from 'naive-ui'
import type { ScheduledJob, ScheduledJobListResponse } from '@rev30/contracts'
import ScheduledJobsPage from '../../../src/pages/index/ops/scheduled-jobs.vue'
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
import {
  getScheduledJobRun as getScheduledJobRunRequest,
  listScheduledJobRuns as listScheduledJobRunsRequest,
} from '../../../src/features/ops/requests'
import { mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'

vi.mock('../../../src/features/ops', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/ops')>()),
  executeScheduledJob: vi.fn(),
  cancelScheduledJob: vi.fn(),
  getScheduledJob: vi.fn(),
  getScheduledJobRun: vi.fn(),
  listScheduledJobs: vi.fn(),
  listScheduledJobRuns: vi.fn(),
  updateScheduledJob: vi.fn(),
  updateScheduledJobEnabled: vi.fn(),
}))
vi.mock('../../../src/features/ops/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/ops/requests')>()),
  getScheduledJobRun: vi.fn(),
  listScheduledJobRuns: vi.fn(),
}))

const listMock = vi.mocked(listScheduledJobs)
const executeMock = vi.mocked(executeScheduledJob)
const cancelMock = vi.mocked(cancelScheduledJob)
const listRunsMock = vi.mocked(listScheduledJobRuns)
const getRunMock = vi.mocked(getScheduledJobRun)
const enabledMock = vi.mocked(updateScheduledJobEnabled)
const listRunsRequestMock = vi.mocked(listScheduledJobRunsRequest)
const getRunRequestMock = vi.mocked(getScheduledJobRunRequest)
const updateMock = vi.mocked(updateScheduledJob)
const getJobMock = vi.mocked(getScheduledJob)

const runId = '11111111-1111-4111-8111-111111111111'
const userId = '33333333-3333-4333-8333-333333333333'
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

const jobDetail: ScheduledJob = {
  taskKey: response[0]!.taskKey,
  name: response[0]!.name,
  description: response[0]!.description,
  cronExpression: response[0]!.cronExpression,
  timezone: response[0]!.timezone,
  enabled: response[0]!.enabled,
  nextRunAt: response[0]!.nextRunAt,
}

const detail = {
  id: runId,
  taskKey: 'auth-session-cleanup' as const,
  triggerSource: 'manual' as const,
  status: 'running' as const,
  scheduledFor: null,
  deletedCount: null,
  failedCount: null,
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
  finishedAt: null,
  durationMs: null,
  createdAt: '2026-08-25T04:00:00.000Z',
}

const completedDetail = {
  ...detail,
  status: 'success' as const,
  deletedCount: 4,
  failedCount: 0,
  finishedAt: '2026-08-25T04:00:01.000Z',
  durationMs: 1000,
}

const publicRun = {
  id: detail.id,
  taskKey: detail.taskKey,
  triggerSource: detail.triggerSource,
  status: detail.status,
  scheduledFor: detail.scheduledFor,
  deletedCount: detail.deletedCount,
  failedCount: detail.failedCount,
  errorCategory: detail.errorCategory,
  errorSummary: detail.errorSummary,
  startedAt: detail.startedAt,
  finishedAt: detail.finishedAt,
  durationMs: detail.durationMs,
  createdAt: detail.createdAt,
}

const completedPublicRun = {
  ...publicRun,
  status: completedDetail.status,
  deletedCount: completedDetail.deletedCount,
  failedCount: completedDetail.failedCount,
  finishedAt: completedDetail.finishedAt,
  durationMs: completedDetail.durationMs,
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
    updateMock.mockReset()
    getJobMock.mockReset()
    listMock.mockResolvedValue(response)
    executeMock.mockResolvedValue({ runId })
    cancelMock.mockResolvedValue({ run: response[0]!.currentRun! })
    enabledMock.mockResolvedValue(response[0]!)
    listRunsMock.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 10 })
    getRunMock.mockResolvedValue(detail)
    listRunsRequestMock.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 10 })
    getRunRequestMock.mockResolvedValue(detail)
    updateMock.mockResolvedValue(response[0]!)
    getJobMock.mockResolvedValue(jobDetail)
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

  it('submits a manual run, polls its detail until terminal, and loads logs on return', async () => {
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
        expect(getRunRequestMock).toHaveBeenCalledWith('auth-session-cleanup', runId)
      })
      expect(listRunsRequestMock).not.toHaveBeenCalled()

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

      document.querySelector<HTMLButtonElement>('[data-test="scheduled-job-run-back"]')?.click()
      await flushPromises()
      await vi.waitFor(() => {
        expect(listRunsRequestMock).toHaveBeenCalledWith('auth-session-cleanup', {
          page: 1,
          pageSize: 10,
        })
      })
    } finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('shows the edit drawer preview and accepts a supported Cron shortcut', async () => {
    const { wrapper } = await mountPage()
    await flushPromises()

    await wrapper.get('[data-test="scheduled-job-edit"]').trigger('click')
    await flushPromises()

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('未来五次执行预览')
    })
    expect(getJobMock).toHaveBeenCalledWith('auth-session-cleanup')
    const editDrawer = document.querySelector('[data-test="scheduled-job-form-drawer"]')
    expect(editDrawer?.textContent).toContain('编辑定时任务')
    expect(editDrawer?.textContent).not.toContain('编辑：')
    const editContext = document.querySelector('[data-test="scheduled-job-form-context"]')
    expect(editContext?.textContent).toContain('当前任务：认证会话清理')
    expect(editContext?.textContent).not.toContain('auth-session-cleanup')
    expect(document.body.textContent).toContain('Cron 表达式按分钟级解析')
    expect(editDrawer?.textContent).toContain('GMT+08:00')
    const timezoneOptions = wrapper.findComponent(NSelect).props('options') as
      | Array<{ value?: string | number }>
      | undefined
    expect(timezoneOptions?.some((option) => option.value === 'UTC')).toBe(true)
    expect(
      document.querySelectorAll('[data-test="scheduled-job-form-cron-expression"]'),
    ).toHaveLength(1)

    const input = wrapper
      .findAllComponents(NInput)
      .find(
        (component) => component.attributes('data-test') === 'scheduled-job-form-cron-expression',
      )
    expect(input).toBeDefined()
    input!.vm.$emit('update:value', '@daily')
    await flushPromises()

    expect(document.body.textContent).not.toContain('Cron 表达式或时区无效')
    expect(
      document.querySelector('[data-test="scheduled-job-form-submit"]')?.hasAttribute('disabled'),
    ).toBe(false)

    const editCancelButton = document.querySelector<HTMLButtonElement>(
      '[data-test="scheduled-job-form-cancel"]',
    )
    expect(editCancelButton).not.toBeNull()
    editCancelButton!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('放弃未保存的更改？')
    document
      .querySelector<HTMLButtonElement>('[data-test="unsaved-changes-discard-cancel"]')
      ?.click()
    await flushPromises()
    expect(
      document.querySelector('[data-test="scheduled-job-form-cron-expression"]'),
    ).not.toBeNull()
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
      expect(document.querySelector('[data-test="scheduled-job-form-submit"]')).not.toBeNull()
    })
    document.querySelector<HTMLButtonElement>('[data-test="scheduled-job-form-submit"]')!.click()
    await flushPromises()
    expect(updateMock).toHaveBeenCalledWith('auth-session-cleanup', {
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
      expect(getRunRequestMock).toHaveBeenCalledWith('auth-session-cleanup', activeRunId)
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
        expect(getRunRequestMock).toHaveBeenCalledWith('auth-session-cleanup', runId)
      })
    } finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('keeps pagination independent from detail', async () => {
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
      expect(listRunsRequestMock).toHaveBeenCalledWith('auth-session-cleanup', {
        page: 1,
        pageSize: 10,
      })
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
    expect(document.body.textContent).toContain(userId)
    expect(document.body.textContent).toContain('成功')
    expect(runLogDrawer?.textContent).toContain('定时任务日志')
    expect(runLogDrawer?.textContent).not.toContain('运行详情：')
    expect(document.querySelector('[data-test="scheduled-job-run-back"]')).not.toBeNull()

    document.querySelector<HTMLButtonElement>('[data-test="scheduled-job-run-back"]')?.click()
    await flushPromises()

    listRunsRequestMock.mockResolvedValue({
      list: [],
      total: 11,
      page: 2,
      pageSize: 10,
    })
    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()
    expect(listRunsRequestMock).toHaveBeenLastCalledWith('auth-session-cleanup', {
      page: 2,
      pageSize: 10,
    })
  })

  it('does not render cancel when a task has no current running record', async () => {
    listMock.mockResolvedValue([{ ...response[0]!, currentRun: null }])
    const { wrapper } = await mountPage(['ops:scheduled-job:list', 'ops:scheduled-job:cancel'])
    await flushPromises()

    expect(wrapper.findAll('[data-test="scheduled-job-cancel"]')).toHaveLength(0)
  })
})
