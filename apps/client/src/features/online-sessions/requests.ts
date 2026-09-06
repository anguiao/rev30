import {
  type OnlineSessionListQuery,
  type OnlineSessionListResponse,
  onlineSessionListResponseSchema,
} from '@rev30/contracts'
import { api } from '../../api'
import { assertApiResponseOk, normalizeRequestQuery, parseApiResponse } from '../../utils/request'

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
