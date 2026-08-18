import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnlineSessionListResponse } from '@rev30/contracts'
import { ApiRequestError } from '../../../src/utils/request'
import OnlineSessionsPage from '../../../src/pages/index/ops/online-sessions.vue'
import { listOnlineSessions, revokeOnlineSession } from '../../../src/features/ops'
import { mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'

vi.mock('../../../src/features/ops', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/ops')>()),
  listOnlineSessions: vi.fn(),
  revokeOnlineSession: vi.fn(),
}))

const listOnlineSessionsMock = vi.mocked(listOnlineSessions)
const revokeOnlineSessionMock = vi.mocked(revokeOnlineSession)
const targetSessionId = '11111111-1111-4111-8111-111111111111'
const response: OnlineSessionListResponse = {
  list: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      userId: session.user.id,
      username: 'ada',
      nickname: 'Ada Lovelace',
      createdIp: '127.0.0.1',
      createdIpSource: 'socket',
      userAgent: null,
      createdAt: '2026-08-18T08:00:00.000Z',
      lastActiveAt: '2026-08-18T08:30:00.000Z',
      expiresAt: '2026-08-25T08:00:00.000Z',
      isCurrent: true,
    },
    {
      id: targetSessionId,
      userId: '33333333-3333-4333-8333-333333333333',
      username: 'grace',
      nickname: 'Grace Hopper',
      createdIp: '203.0.113.2',
      createdIpSource: 'x-forwarded-for',
      userAgent: {
        raw: 'Mobile Safari test agent',
        browser: { name: 'Safari', version: '18' },
        operatingSystem: { name: 'iOS', version: '18' },
        deviceType: 'mobile',
      },
      createdAt: '2026-08-18T09:00:00.000Z',
      lastActiveAt: '2026-08-18T09:30:00.000Z',
      expiresAt: '2026-08-25T09:00:00.000Z',
      isCurrent: false,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
}

async function mountPage() {
  return mountAuthRoute(
    '/ops/online-sessions',
    [{ path: '/ops/online-sessions', component: OnlineSessionsPage }],
    {
      ...session,
      accessCodes: ['ops:online-session:list', 'ops:online-session:revoke'],
    },
  )
}

async function confirmTargetRevocation() {
  const button = document.body.querySelector(
    '[data-test="online-session-revoke-confirm"]',
  ) as HTMLButtonElement | null
  expect(button).not.toBeNull()
  button?.click()
  await flushPromises()
}

describe('online sessions page', () => {
  beforeEach(() => {
    listOnlineSessionsMock.mockReset()
    revokeOnlineSessionMock.mockReset()
    listOnlineSessionsMock.mockResolvedValue(response)
    revokeOnlineSessionMock.mockResolvedValue(undefined)
    stubPreferredDark(false)
  })

  it('marks and protects the current session, then revokes another session and refreshes', async () => {
    const { wrapper } = await mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('当前会话')
    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('Safari 18 · iOS 18 · 移动设备')
    const revokeButtons = wrapper.findAll('[data-test="online-session-revoke"]')
    expect(revokeButtons).toHaveLength(2)
    expect(revokeButtons[0]!.attributes('disabled')).toBeDefined()

    await revokeButtons[1]!.trigger('click')
    await flushPromises()
    await confirmTargetRevocation()

    expect(revokeOnlineSessionMock).toHaveBeenCalledWith(targetSessionId)
    expect(listOnlineSessionsMock).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('强制下线成功')
  })

  it('shows a stale-list error and refreshes after a 404 response', async () => {
    revokeOnlineSessionMock.mockRejectedValue(new ApiRequestError(404, '在线会话不存在'))
    const { wrapper } = await mountPage()
    await flushPromises()

    await wrapper.findAll('[data-test="online-session-revoke"]')[1]!.trigger('click')
    await flushPromises()
    await confirmTargetRevocation()

    expect(document.body.textContent).toContain('在线会话不存在')
    expect(listOnlineSessionsMock).toHaveBeenCalledTimes(2)
  })

  it('uses the service message and keeps the dialog open after a 409 response', async () => {
    revokeOnlineSessionMock.mockRejectedValue(new ApiRequestError(409, '不能强制下线当前会话'))
    const { wrapper } = await mountPage()
    await flushPromises()

    await wrapper.findAll('[data-test="online-session-revoke"]')[1]!.trigger('click')
    await flushPromises()
    await confirmTargetRevocation()

    expect(document.body.textContent).toContain('不能强制下线当前会话')
    expect(listOnlineSessionsMock).toHaveBeenCalledTimes(1)
    expect(
      document.body.querySelector('[data-test="online-session-revoke-confirm"]'),
    ).not.toBeNull()
  })
})
