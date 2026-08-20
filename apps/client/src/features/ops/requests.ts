import {
  type LoginLogListQuery,
  type LoginLogListResponse,
  loginLogListResponseSchema,
  type OnlineSessionListQuery,
  type OnlineSessionListResponse,
  onlineSessionListResponseSchema,
  type OperationLogDetail,
  operationLogDetailSchema,
  type OperationLogListQuery,
  type OperationLogListResponse,
  operationLogListResponseSchema,
} from '@rev30/contracts'
import { api } from '../../api'
import { assertApiResponseOk, normalizeRequestQuery, parseApiResponse } from '../../utils/request'

export async function listLoginLogs(query: LoginLogListQuery): Promise<LoginLogListResponse> {
  return parseApiResponse(
    await api.ops['login-logs'].$get({ query: normalizeRequestQuery(query) }),
    loginLogListResponseSchema,
  )
}

export async function listOnlineSessions(
  query: OnlineSessionListQuery,
): Promise<OnlineSessionListResponse> {
  return parseApiResponse(
    await api.ops.sessions.$get({ query: normalizeRequestQuery(query) }),
    onlineSessionListResponseSchema,
  )
}

export async function revokeOnlineSession(id: string): Promise<void> {
  await assertApiResponseOk(await api.ops.sessions[':id'].$delete({ param: { id } }))
}

export async function listOperationLogs(
  query: OperationLogListQuery,
): Promise<OperationLogListResponse> {
  return parseApiResponse(
    await api.ops['operation-logs'].$get({ query: normalizeRequestQuery(query) }),
    operationLogListResponseSchema,
  )
}

export async function getOperationLog(id: string): Promise<OperationLogDetail> {
  return parseApiResponse(
    await api.ops['operation-logs'][':id'].$get({ param: { id } }),
    operationLogDetailSchema,
  )
}
