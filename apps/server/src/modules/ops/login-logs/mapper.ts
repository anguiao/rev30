import {
  LOGIN_LOG_RESULT_FAILURE,
  LOGIN_LOG_RESULT_SUCCESS,
  type ClientIpSource,
  type LoginFailureReason,
  type LoginLogListItem,
} from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { opsLoginLogs } from '../../../db/schema'
import { toOpsUserAgent } from '../user-agent'

export type LoginLogRow = typeof opsLoginLogs.$inferSelect

export function toLoginLogListItem(row: LoginLogRow): LoginLogListItem {
  const base = {
    id: row.id,
    username: row.username,
    requestId: row.requestId,
    clientIp: row.clientIp,
    clientIpSource: row.clientIpSource as ClientIpSource,
    userAgent: toOpsUserAgent(row.userAgent),
    createdAt: toIsoDateTime(row.createdAt),
  }

  if (row.result === LOGIN_LOG_RESULT_SUCCESS) {
    return {
      ...base,
      userId: row.userId!,
      result: LOGIN_LOG_RESULT_SUCCESS,
      failureReason: null,
      sessionId: row.sessionId!,
    }
  }

  return {
    ...base,
    userId: row.userId,
    result: LOGIN_LOG_RESULT_FAILURE,
    failureReason: row.failureReason as LoginFailureReason,
    sessionId: null,
  }
}
