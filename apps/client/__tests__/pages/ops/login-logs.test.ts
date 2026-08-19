import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NDatePicker, NSelect } from 'naive-ui'
import type { LoginLogListResponse } from '@rev30/contracts'
import LoginLogsPage from '../../../src/pages/index/ops/login-logs.vue'
import { listLoginLogs } from '../../../src/features/ops'
import { mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'

vi.mock('../../../src/features/ops', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/ops')>()),
  listLoginLogs: vi.fn(),
}))

const listLoginLogsMock = vi.mocked(listLoginLogs)
const response: LoginLogListResponse = {
  list: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      username: 'ada',
      result: 'success',
      failureReason: null,
      sessionId: '33333333-3333-4333-8333-333333333333',
      requestId: '44444444-4444-4444-8444-444444444444',
      clientIp: '203.0.113.1',
      clientIpSource: 'x-forwarded-for',
      userAgent: {
        raw: 'Mozilla/5.0 Chrome test agent',
        browser: { name: 'Chrome', version: '140' },
        operatingSystem: { name: 'macOS', version: '15' },
        deviceType: 'desktop',
      },
      createdAt: '2026-08-18T08:00:00.000Z',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      userId: null,
      username: 'unknown',
      result: 'failure',
      failureReason: 'invalid_credentials',
      sessionId: null,
      requestId: '66666666-6666-4666-8666-666666666666',
      clientIp: null,
      clientIpSource: 'unavailable',
      userAgent: null,
      createdAt: '2026-08-18T09:00:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
}

async function mountPage() {
  return mountAuthRoute(
    '/ops/login-logs',
    [{ path: '/ops/login-logs', component: LoginLogsPage }],
    {
      ...session,
      accessCodes: ['ops:login-log:list'],
    },
  )
}

function getSelect(wrapper: VueWrapper, dataTest: string) {
  return wrapper
    .findAllComponents(NSelect)
    .find((item) => item.attributes('data-test') === dataTest)!
}

describe('login logs page', () => {
  beforeEach(() => {
    listLoginLogsMock.mockReset()
    listLoginLogsMock.mockResolvedValue(response)
    stubPreferredDark(false)
  })

  it('renders results, failure reasons, and device details without internal identifiers', async () => {
    const { wrapper } = await mountPage()
    await flushPromises()

    expect(listLoginLogsMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('成功')
    expect(wrapper.text()).toContain('凭据无效')
    expect(wrapper.text()).toContain('Chrome 140 · macOS 15 · 桌面设备')
    expect(wrapper.text()).toContain('未知设备')
    expect(wrapper.text()).not.toContain('标识信息')
    expect(wrapper.text()).not.toContain('请求 ID')
    expect(wrapper.text()).not.toContain('会话 ID')
    expect(wrapper.get('[title="Mozilla/5.0 Chrome test agent"]')).toBeDefined()
    expect(wrapper.get('[title="x-forwarded-for"]')).toBeDefined()
  })

  it('disables incompatible failure reason and sends local range as UTC ISO', async () => {
    const { wrapper } = await mountPage()
    await flushPromises()

    getSelect(wrapper, 'login-logs-failure-reason').vm.$emit('update:value', 'invalid_credentials')
    getSelect(wrapper, 'login-logs-result').vm.$emit('update:value', 'success')
    const from = new Date(2026, 7, 18, 9, 30).getTime()
    const to = new Date(2026, 7, 18, 17, 45).getTime()
    wrapper.getComponent(NDatePicker).vm.$emit('update:value', [from, to])
    await wrapper.find('[data-test="login-logs-username"] input').setValue('  ada  ')
    await wrapper.get('[data-test="login-logs-search"]').trigger('click')
    await flushPromises()

    expect(getSelect(wrapper, 'login-logs-failure-reason').props('disabled')).toBe(true)
    expect(getSelect(wrapper, 'login-logs-failure-reason').props('value')).toBeNull()
    expect(listLoginLogsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      username: 'ada',
      result: 'success',
      occurredFrom: new Date(from).toISOString(),
      occurredTo: new Date(to).toISOString(),
    })
  })
})
