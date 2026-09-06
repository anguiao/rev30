import {
  type LoginLogListQuery,
  type LoginLogListResponse,
  loginLogListResponseSchema,
} from '@rev30/contracts'
import { api } from '../../api'
import { normalizeRequestQuery, parseApiResponse } from '../../utils/request'

export async function listLoginLogs(query: LoginLogListQuery): Promise<LoginLogListResponse> {
  return parseApiResponse(
    await api.ops['login-logs'].$get({ query: normalizeRequestQuery(query) }),
    loginLogListResponseSchema,
  )
}
