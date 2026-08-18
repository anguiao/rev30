import { beforeEach, describe, expect, it } from 'vitest'
import type { LoginLogListResponse, OnlineSessionListResponse } from '@rev30/contracts'
import { useAuthStore } from '../../../src/stores/auth'
import { listLoginLogs, listOnlineSessions, revokeOnlineSession } from '../../../src/features/ops'
import { createFetchMock, emptyResponse, expectFetchCall, jsonResponse } from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const loginLogResponse: LoginLogListResponse = {
  list: [],
  total: 0,
  page: 2,
  pageSize: 50,
}

const onlineSessionResponse: OnlineSessionListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: 20,
}

beforeEach(() => {
  const pinia = createTestPinia()
  useAuthStore(pinia).accessToken = 'access-token'
})

describe('operations requests', () => {
  it('serializes login log filters and parses the response contract', async () => {
    const fetchMock = createFetchMock(jsonResponse(loginLogResponse))

    await expect(
      listLoginLogs({
        page: 2,
        pageSize: 50,
        username: 'ada',
        result: 'failure',
        failureReason: 'rate_limited',
        clientIp: '203.0.113.1',
        occurredFrom: '2026-08-18T00:00:00.000Z',
        occurredTo: '2026-08-18T23:59:59.000Z',
      }),
    ).resolves.toEqual(loginLogResponse)

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/ops/login-logs',
      query: {
        page: '2',
        pageSize: '50',
        username: 'ada',
        result: 'failure',
        failureReason: 'rate_limited',
        clientIp: '203.0.113.1',
        occurredFrom: '2026-08-18T00:00:00.000Z',
        occurredTo: '2026-08-18T23:59:59.000Z',
      },
    })
  })

  it('rejects an invalid online session response', async () => {
    createFetchMock(jsonResponse({ ...onlineSessionResponse, total: -1 }))

    await expect(listOnlineSessions({ page: 1, pageSize: 20 })).rejects.toThrow()
  })

  it('requests online sessions and revokes one with DELETE', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111111'
    const fetchMock = createFetchMock(jsonResponse(onlineSessionResponse), emptyResponse())

    await expect(
      listOnlineSessions({ page: 1, pageSize: 20, username: 'ada', createdIp: '127.0.0.1' }),
    ).resolves.toEqual(onlineSessionResponse)
    await expect(revokeOnlineSession(sessionId)).resolves.toBeUndefined()

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/ops/sessions',
      query: { page: '1', pageSize: '20', username: 'ada', createdIp: '127.0.0.1' },
    })
    expectFetchCall(fetchMock, 1, {
      method: 'DELETE',
      pathname: `/api/ops/sessions/${sessionId}`,
    })
  })
})
