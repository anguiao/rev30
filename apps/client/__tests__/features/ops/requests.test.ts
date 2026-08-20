import { beforeEach, describe, expect, it } from 'vitest'
import type {
  LoginLogListResponse,
  OnlineSessionListResponse,
  OperationLogDetail,
  OperationLogListResponse,
} from '@rev30/contracts'
import { useAuthStore } from '../../../src/stores/auth'
import {
  getOperationLog,
  listLoginLogs,
  listOnlineSessions,
  listOperationLogs,
  revokeOnlineSession,
} from '../../../src/features/ops'
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

const operationLogResponse: OperationLogListResponse = {
  list: [],
  total: 0,
  page: 2,
  pageSize: 50,
}

const operationLogDetail: OperationLogDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
  actorUsername: 'ada',
  actorNickname: 'Ada',
  actorIsAdmin: true,
  actorSessionId: '33333333-3333-4333-8333-333333333333',
  module: 'ops',
  action: 'ops:online-session:revoke',
  targetType: 'online-session',
  targetKey: '44444444-4444-4444-8444-444444444444',
  targetLabel: null,
  result: 'failure',
  httpStatus: 409,
  durationMs: 12,
  requestId: '55555555-5555-4555-8555-555555555555',
  clientIp: '203.0.113.1',
  clientIpSource: 'socket',
  userAgent: null,
  createdAt: '2026-08-19T00:00:00.000Z',
}

beforeEach(() => {
  const pinia = createTestPinia()
  useAuthStore(pinia).accessToken = 'access-token'
})

describe('operations requests', () => {
  it('serializes operation log session, status, and time filters and loads detail', async () => {
    const fetchMock = createFetchMock(
      jsonResponse(operationLogResponse),
      jsonResponse(operationLogDetail),
    )

    await expect(
      listOperationLogs({
        page: 2,
        pageSize: 50,
        actorKeyword: 'ada',
        actorSessionId: operationLogDetail.actorSessionId,
        module: 'ops',
        action: 'ops:online-session:revoke',
        result: 'failure',
        httpStatus: 409,
        targetKeyword: 'session',
        clientIp: '203.0.113.1',
        requestId: operationLogDetail.requestId,
        occurredFrom: '2026-08-18T00:00:00.000Z',
        occurredTo: '2026-08-19T00:00:00.000Z',
      }),
    ).resolves.toEqual(operationLogResponse)
    await expect(getOperationLog(operationLogDetail.id)).resolves.toEqual(operationLogDetail)

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/ops/operation-logs',
      query: {
        page: '2',
        pageSize: '50',
        actorKeyword: 'ada',
        actorSessionId: operationLogDetail.actorSessionId,
        module: 'ops',
        action: 'ops:online-session:revoke',
        result: 'failure',
        httpStatus: '409',
        targetKeyword: 'session',
        clientIp: '203.0.113.1',
        requestId: operationLogDetail.requestId,
        occurredFrom: '2026-08-18T00:00:00.000Z',
        occurredTo: '2026-08-19T00:00:00.000Z',
      },
    })
    expectFetchCall(fetchMock, 1, {
      method: 'GET',
      pathname: `/api/ops/operation-logs/${operationLogDetail.id}`,
    })
  })

  it('rejects malformed operation log list and detail responses', async () => {
    createFetchMock(
      jsonResponse({ ...operationLogResponse, total: -1 }),
      jsonResponse({ ...operationLogDetail, httpStatus: 99 }),
    )

    await expect(listOperationLogs({ page: 1, pageSize: 20 })).rejects.toThrow()
    await expect(getOperationLog(operationLogDetail.id)).rejects.toThrow()
  })

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
