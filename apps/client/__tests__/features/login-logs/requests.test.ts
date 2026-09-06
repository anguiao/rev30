import { beforeEach, describe, expect, it } from 'vitest'
import type { LoginLogListResponse } from '@rev30/contracts'
import { useAuthStore } from '../../../src/stores/auth'
import { listLoginLogs } from '../../../src/features/login-logs/requests'
import { createFetchMock, expectFetchCall, jsonResponse } from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const loginLogResponse: LoginLogListResponse = {
  list: [],
  total: 0,
  page: 2,
  pageSize: 50,
}

beforeEach(() => {
  const pinia = createTestPinia()
  useAuthStore(pinia).accessToken = 'access-token'
})

describe('login-logs request helpers', () => {
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
})
