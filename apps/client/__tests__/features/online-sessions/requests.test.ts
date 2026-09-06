import { beforeEach, describe, expect, it } from 'vitest'
import type { OnlineSessionListResponse } from '@rev30/contracts'
import { useAuthStore } from '../../../src/stores/auth'
import {
  listOnlineSessions,
  revokeOnlineSession,
} from '../../../src/features/online-sessions/requests'
import { createFetchMock, emptyResponse, expectFetchCall, jsonResponse } from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

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

describe('online-sessions request helpers', () => {
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
