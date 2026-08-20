import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NDatePicker, NInputNumber, NPagination, NSelect } from 'naive-ui'
import type { OperationLogDetail, OperationLogListResponse } from '@rev30/contracts'
import OperationLogsPage from '../../../src/pages/index/ops/operation-logs.vue'
import { getOperationLog, listOperationLogs } from '../../../src/features/ops'
import { mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'

vi.mock('../../../src/features/ops', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/ops')>()),
  getOperationLog: vi.fn(),
  listOperationLogs: vi.fn(),
}))

const id = '11111111-1111-4111-8111-111111111111'
const actorUserId = '22222222-2222-4222-8222-222222222222'
const actorSessionId = '33333333-3333-4333-8333-333333333333'
const requestId = '44444444-4444-4444-8444-444444444444'
const listResponse: OperationLogListResponse = {
  list: [
    {
      id,
      actorUserId,
      actorUsername: 'ada',
      actorNickname: 'Ada Lovelace',
      module: 'system',
      action: 'system:user:update',
      targetType: 'user',
      targetKey: 'user-key',
      targetLabel: 'Updated User',
      result: 'failure',
      httpStatus: 409,
      durationMs: 37,
      clientIp: '203.0.113.1',
      createdAt: '2026-08-19T08:00:00.000Z',
    },
  ],
  total: 41,
  page: 1,
  pageSize: 20,
}
const detail: OperationLogDetail = {
  ...listResponse.list[0]!,
  actorIsAdmin: true,
  actorSessionId,
  requestId,
  clientIpSource: 'x-forwarded-for',
  userAgent: {
    raw: 'private raw user agent',
    browser: { name: 'Chrome', version: '140' },
    operatingSystem: { name: 'macOS', version: '15' },
    deviceType: 'desktop',
  },
}

const listMock = vi.mocked(listOperationLogs)
const detailMock = vi.mocked(getOperationLog)

async function mountPage() {
  return mountAuthRoute(
    '/ops/operation-logs',
    [{ path: '/ops/operation-logs', component: OperationLogsPage }],
    { ...session, accessCodes: ['ops:operation-log:list'] },
  )
}

function getSelect(wrapper: VueWrapper, dataTest: string) {
  return wrapper
    .findAllComponents(NSelect)
    .find((item) => item.attributes('data-test') === dataTest)!
}

describe('operation logs page', () => {
  beforeEach(() => {
    listMock.mockReset()
    detailMock.mockReset()
    listMock.mockResolvedValue(listResponse)
    detailMock.mockResolvedValue(detail)
    stubPreferredDark(false)
  })

  it('searches, resets, paginates, and clears incompatible actions', async () => {
    const { wrapper } = await mountPage()
    await flushPromises()
    const moduleSelect = getSelect(wrapper, 'operation-logs-module')
    const actionSelect = getSelect(wrapper, 'operation-logs-action')

    moduleSelect.vm.$emit('update:value', 'system')
    actionSelect.vm.$emit('update:value', 'system:user:update')
    await flushPromises()
    expect(
      (actionSelect.props('options') ?? []).every((item) =>
        String('value' in item ? item.value : '').startsWith('system:'),
      ),
    ).toBe(true)
    moduleSelect.vm.$emit('update:value', 'content')
    await flushPromises()
    expect(actionSelect.props('value')).toBeNull()

    await wrapper.find('[data-test="operation-logs-actor"] input').setValue('  ada  ')
    await wrapper.find('[data-test="operation-logs-session"] input').setValue(` ${actorSessionId} `)
    await wrapper.find('[data-test="operation-logs-target"] input').setValue('  target  ')
    await wrapper.find('[data-test="operation-logs-client-ip"] input').setValue(' 203.0.113.1 ')
    await wrapper.find('[data-test="operation-logs-request-id"] input').setValue(` ${requestId} `)
    getSelect(wrapper, 'operation-logs-result').vm.$emit('update:value', 'failure')
    const statusInput = wrapper.getComponent(NInputNumber)
    expect(statusInput.props()).toMatchObject({ min: 100, max: 599, precision: 0 })
    statusInput.vm.$emit('update:value', 409)
    const from = new Date(2026, 7, 18, 9, 30).getTime()
    const to = new Date(2026, 7, 19, 17, 45).getTime()
    wrapper.getComponent(NDatePicker).vm.$emit('update:value', [from, to])
    await wrapper.get('[data-test="operation-logs-search"]').trigger('click')
    await flushPromises()

    expect(listMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        actorKeyword: 'ada',
        actorSessionId,
        module: 'content',
        result: 'failure',
        httpStatus: 409,
        targetKeyword: 'target',
        clientIp: '203.0.113.1',
        requestId,
        occurredFrom: new Date(from).toISOString(),
        occurredTo: new Date(to).toISOString(),
      }),
    )

    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()
    expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    await wrapper.get('[data-test="operation-logs-reset"]').trigger('click')
    await flushPromises()
    expect(listMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })

  it('renders safe list fields and lazily loads structured detail with copy controls', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { wrapper } = await mountPage()
    await flushPromises()

    expect(detailMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('共 41 条')
    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('ada')
    expect(wrapper.text()).toContain('更新用户')
    expect(wrapper.text()).toContain('Updated User')
    expect(wrapper.text()).toContain('user-key')
    expect(wrapper.text()).toContain('失败')
    expect(wrapper.text()).toContain('409')
    expect(wrapper.text()).toContain('37 ms')
    expect(wrapper.text()).not.toContain(actorSessionId)
    expect(wrapper.text()).not.toContain(requestId)
    expect(wrapper.text()).not.toContain('private raw user agent')

    await wrapper.get('[data-test="operation-log-detail"]').trigger('click')
    await flushPromises()
    expect(detailMock).toHaveBeenCalledWith(id)
    const detailText = document.body.textContent ?? ''
    expect(detailText).toContain('管理员')
    expect(detailText).toContain(actorUserId)
    expect(detailText).toContain(actorSessionId)
    expect(detailText).toContain(requestId)
    expect(detailText).toContain('x-forwarded-for')
    expect(detailText).toContain('Chrome 140 · macOS 15 · 桌面设备')
    expect(document.querySelector('[title="private raw user agent"]')).not.toBeNull()
    const copyButtons = document.querySelectorAll<HTMLElement>(
      '[data-test="operation-log-copy-id"]',
    )
    expect(copyButtons).toHaveLength(3)
    copyButtons.forEach((button) => button.click())
    await flushPromises()
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([
      actorUserId,
      requestId,
      actorSessionId,
    ])
    expect(detailText).not.toMatch(/导出|删除|清空|批量|JSON/)
  })
})
