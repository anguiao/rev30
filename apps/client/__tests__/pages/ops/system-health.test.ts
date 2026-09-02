import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SystemHealthPage from '../../../src/pages/index/ops/system-health.vue'
import {
  getSystemHealth,
  getSystemHealthJobStatistics,
} from '../../../src/features/ops/system-health/requests'
import { useThemeStore } from '../../../src/stores/theme'
import { mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'
import { healthSnapshot, healthStatistics } from '../../helpers/system-health'
import { createDeferred } from '../../helpers/promise'

vi.mock('../../../src/features/ops/system-health/requests', () => ({
  getSystemHealth: vi.fn(),
  getSystemHealthJobStatistics: vi.fn(),
}))
vi.mock('vue-echarts', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'VChart',
      props: { option: Object, theme: String, autoresize: Boolean },
      setup: () => () => h('div'),
    }),
  }
})
vi.mock('../../../src/features/ops/ScheduledJobRunLogDrawer.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'ScheduledJobRunLogDrawer',
      props: ['taskKey', 'taskName', 'initialRunId', 'show'],
      setup: () => () => h('div'),
    }),
  }
})
const snapshotMock = vi.mocked(getSystemHealth)
const statisticsMock = vi.mocked(getSystemHealthJobStatistics)
async function mountPage() {
  const result = await mountAuthRoute(
    '/ops/system-health',
    [
      { path: '/ops/system-health', component: SystemHealthPage },
      { path: '/away', component: { template: '<div>away</div>' } },
    ],
    { ...session, accessCodes: ['ops:system-health:list'] },
  )
  await flushPromises()
  return result
}
async function visibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
}
async function tick(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
  await flushPromises()
}
beforeEach(() => {
  vi.useFakeTimers()
  stubPreferredDark(false)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  snapshotMock.mockReset().mockResolvedValue(healthSnapshot())
  statisticsMock.mockReset().mockResolvedValue(healthStatistics())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('system health page', () => {
  it('renders independent times, chart mapping, accessible summaries and theme; opens the selected anomaly', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.text()).toContain('当前响应实例')
    expect(wrapper.text()).toContain('数据库共享状态')
    expect(wrapper.text()).toContain('12:00:00')
    expect(wrapper.text()).toContain('12:00:01')
    expect(wrapper.text()).toContain('按当前留存日志统计，已清理记录不计入统计')
    const charts = wrapper.findAllComponents({ name: 'VChart' })
    expect(charts).toHaveLength(7)
    for (const chart of charts) {
      expect(chart.props('autoresize')).toBe(true)
      expect(chart.props('option').aria.enabled).toBe(true)
    }
    expect(charts[0]!.props('option').series).toHaveLength(6)
    expect(charts[0]!.props('option').series[1].data).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(charts[1]!.props('option').series[0].data).toHaveLength(6)
    expect(charts[2]!.props('option').series[0].data).toHaveLength(4)
    expect(charts[3]!.props('option').series[0].data).toEqual([1250])
    useThemeStore().setMode('dark')
    await flushPromises()
    expect(charts.every((chart) => chart.props('theme') === 'dark')).toBe(true)
    const button = wrapper.findAll('button').find((item) => item.text().includes('认证会话清理'))!
    await button.trigger('click')
    await flushPromises()
    const drawer = wrapper.findComponent({ name: 'ScheduledJobRunLogDrawer' })
    expect(drawer.props()).toMatchObject({
      taskKey: 'auth-session-cleanup',
      taskName: '认证会话清理',
      initialRunId: healthStatistics().recentAnomalies[0]!.runId,
      show: true,
    })
    wrapper.unmount()
  })

  it('polls at 10 and 60 seconds, refreshes both immediately, pauses hidden and stops on unmount', async () => {
    const { wrapper } = await mountPage()
    await tick(10000)
    expect(snapshotMock).toHaveBeenCalledTimes(2)
    expect(statisticsMock).toHaveBeenCalledTimes(1)
    await tick(50000)
    expect(snapshotMock).toHaveBeenCalledTimes(7)
    expect(statisticsMock).toHaveBeenCalledTimes(2)
    await wrapper
      .findAll('button')
      .find((item) => item.text() === '立即刷新')!
      .trigger('click')
    await flushPromises()
    expect(snapshotMock).toHaveBeenCalledTimes(8)
    expect(statisticsMock).toHaveBeenCalledTimes(3)
    await visibility('hidden')
    await tick(120000)
    expect(snapshotMock).toHaveBeenCalledTimes(8)
    expect(statisticsMock).toHaveBeenCalledTimes(3)
    await visibility('visible')
    expect(snapshotMock).toHaveBeenCalledTimes(9)
    expect(statisticsMock).toHaveBeenCalledTimes(4)
    wrapper.unmount()
    await tick(120000)
    expect(snapshotMock).toHaveBeenCalledTimes(9)
    expect(statisticsMock).toHaveBeenCalledTimes(4)
  })

  it('retains successful data independently and continues automatic retries after repeated failures', async () => {
    const { wrapper } = await mountPage()
    snapshotMock.mockRejectedValue(new Error('snapshot unavailable'))
    statisticsMock.mockRejectedValue(new Error('statistics unavailable'))
    await tick(60000)
    expect(wrapper.text()).toContain('刷新失败，数据截至')
    expect(wrapper.text()).toContain('统计刷新失败，数据截至')
    expect(wrapper.text()).toContain('12:00:00')
    expect(wrapper.text()).toContain('12:00:01')
    expect(wrapper.text()).toContain('认证会话清理')
    expect(snapshotMock).toHaveBeenCalledTimes(7)
    expect(statisticsMock).toHaveBeenCalledTimes(2)
    snapshotMock.mockResolvedValue(healthSnapshot(120))
    statisticsMock.mockResolvedValue({
      ...healthStatistics(),
      generatedAt: healthSnapshot(121).observedAt,
    })
    await tick(60000)
    expect(statisticsMock).toHaveBeenCalledTimes(3)
    expect(wrapper.text()).not.toContain('刷新失败，数据截至')
    expect(wrapper.text()).toContain('12:02:01')
    wrapper.unmount()
  })

  it('shows first-load errors without fabricated health or empty statistics, and recovers', async () => {
    snapshotMock.mockRejectedValue(new Error('snapshot unavailable'))
    statisticsMock.mockRejectedValue(new Error('statistics unavailable'))
    const { wrapper } = await mountPage()
    expect(wrapper.text()).toContain('加载系统健康失败')
    expect(wrapper.text()).toContain('加载任务统计失败')
    expect(wrapper.text()).not.toContain('当前留存日志中无异常任务')
    expect(wrapper.findAllComponents({ name: 'VChart' })).toHaveLength(0)
    snapshotMock.mockResolvedValue({
      ...healthSnapshot(10),
      status: 'degraded',
      issues: ['storage_unavailable'],
      storage: { ...healthSnapshot(10).storage, status: 'unavailable', latencyMs: null },
    })
    await tick(10000)
    expect(wrapper.text()).toContain('附件存储不可用')
    expect(wrapper.text()).toContain('加载任务统计失败')
    wrapper.unmount()
  })

  it('deduplicates pending manual, visibility and periodic refreshes independently', async () => {
    const pending = createDeferred<ReturnType<typeof healthSnapshot>>()
    snapshotMock.mockReturnValue(pending.promise)
    const { wrapper } = await mountPage()
    await wrapper
      .findAll('button')
      .find((item) => item.text() === '立即刷新')!
      .trigger('click')
    await visibility('hidden')
    await visibility('visible')
    await tick(60000)
    expect(snapshotMock).toHaveBeenCalledTimes(1)
    expect(statisticsMock.mock.calls.length).toBeGreaterThan(1)
    pending.resolve(healthSnapshot(60))
    await flushPromises()
    await tick(10000)
    expect(snapshotMock).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('shows explicit empty charts and the retained-log anomaly empty state', async () => {
    const stats = healthStatistics()
    for (const day of stats.dailyRuns) day.success = 0
    stats.statusDistribution = {
      running: 0,
      success: 0,
      failure: 0,
      skipped: 0,
      cancelled: 0,
      interrupted: 0,
    }
    stats.failureCategories.forEach((item) => {
      item.count = 0
    })
    stats.averageDurations = []
    stats.recentAnomalies = []
    statisticsMock.mockResolvedValue(stats)
    const { wrapper } = await mountPage()
    expect(wrapper.text()).toContain('当前留存日志中无异常任务')
    expect(wrapper.text().match(/暂无统计数据/g)).toHaveLength(4)
    wrapper.unmount()
  })
  it('starts page-local trends afresh on remount despite retained query data', async () => {
    const { wrapper, router } = await mountPage()
    await router.push('/away')
    await flushPromises()
    const pending = createDeferred<ReturnType<typeof healthSnapshot>>()
    snapshotMock.mockReturnValueOnce(pending.promise)
    await router.push('/ops/system-health')
    await flushPromises()
    expect(wrapper.text().match(/尚无趋势样本/g)).toHaveLength(3)
    pending.resolve(healthSnapshot(20))
    await flushPromises()
    const charts = wrapper.findAllComponents({ name: 'VChart' })
    expect(charts[4]!.props('option').series[0].data).toEqual([
      [Date.parse(healthSnapshot(20).observedAt), 104857600],
    ])
    expect(charts[4]!.props('option').xAxis.max - charts[4]!.props('option').xAxis.min).toBe(600000)
    wrapper.unmount()
  })

  it('breaks sampling gaps and resets all trends after the responding instance restarts', async () => {
    const { wrapper } = await mountPage()
    await visibility('hidden')
    const cached = healthSnapshot(20)
    cached.storage = { ...healthSnapshot().storage, cached: true }
    snapshotMock.mockResolvedValueOnce(cached).mockResolvedValueOnce(healthSnapshot(30))
    await visibility('visible')
    await tick(10000)
    let charts = wrapper.findAllComponents({ name: 'VChart' })
    expect(
      charts[4]!.props('option').series[0].data.map((point: [number, number | null]) => point[1]),
    ).toEqual([104857600, null, 104857600, 104857600])
    expect(
      charts[6]!.props('option').series[0].data.map((point: [number, number | null]) => point[1]),
    ).toEqual([5, null, 5])
    const restarted = healthSnapshot(40)
    restarted.instance.startedAt = healthSnapshot(39).observedAt
    snapshotMock.mockResolvedValue(restarted)
    await tick(10000)
    charts = wrapper.findAllComponents({ name: 'VChart' })
    for (const chart of charts.slice(4))
      expect(chart.props('option').series[0].data).toHaveLength(1)
    wrapper.unmount()
  })
  it('keeps a completed storage probe later than observedAt inside the shared time axis', async () => {
    const snapshot = healthSnapshot()
    snapshot.storage.checkedAt = healthSnapshot(3).observedAt
    snapshotMock.mockResolvedValue(snapshot)
    const { wrapper } = await mountPage()
    const charts = wrapper.findAllComponents({ name: 'VChart' }).slice(4)
    const probeTime = Date.parse(snapshot.storage.checkedAt)
    for (const chart of charts) {
      expect(chart.props('option').xAxis.max).toBe(probeTime)
      expect(chart.props('option').xAxis.min).toBe(probeTime - 600000)
    }
    expect(charts[2]!.props('option').series[0].data).toEqual([[probeTime, 5]])
    wrapper.unmount()
  })
  it('retries a pending request inherited from an unmounted page after it fails', async () => {
    const pending = createDeferred<ReturnType<typeof healthSnapshot>>()
    snapshotMock.mockReturnValueOnce(pending.promise)
    const { wrapper, router } = await mountPage()
    await router.push('/away')
    await flushPromises()
    await router.push('/ops/system-health')
    await flushPromises()
    expect(snapshotMock).toHaveBeenCalledTimes(1)
    pending.reject(new Error('inherited snapshot failed'))
    await flushPromises()
    expect(wrapper.text()).toContain('加载系统健康失败')
    await tick(10000)
    expect(snapshotMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('加载系统健康失败')
    wrapper.unmount()
  })

  it('does not overlap an inherited pending request after remount and visibility changes', async () => {
    const pending = createDeferred<ReturnType<typeof healthSnapshot>>()
    snapshotMock.mockReturnValueOnce(pending.promise)
    const { wrapper, router } = await mountPage()
    await router.push('/away')
    await flushPromises()
    await router.push('/ops/system-health')
    await flushPromises()
    await visibility('hidden')
    await visibility('visible')
    await tick(20000)
    expect(snapshotMock).toHaveBeenCalledTimes(1)
    pending.resolve(healthSnapshot(20))
    await flushPromises()
    await tick(10000)
    expect(snapshotMock).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
