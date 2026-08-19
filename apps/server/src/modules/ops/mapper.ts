import {
  LOGIN_LOG_RESULT_FAILURE,
  LOGIN_LOG_RESULT_SUCCESS,
  type ClientIpSource,
  type LoginFailureReason,
  type LoginLogListItem,
  type OnlineSessionListItem,
} from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { authSessions, opsLoginLogs, systemUsers } from '../../db/schema'
import { toOpsUserAgent } from './user-agent'

export type LoginLogRow = typeof opsLoginLogs.$inferSelect
type AuthSessionRow = typeof authSessions.$inferSelect
type UserRow = typeof systemUsers.$inferSelect

export type OnlineSessionListEntry = Pick<
  AuthSessionRow,
  'id' | 'createdIp' | 'createdIpSource' | 'userAgent' | 'createdAt' | 'lastActiveAt' | 'expiresAt'
> &
  Pick<UserRow, 'username' | 'nickname'> & {
    userId: UserRow['id']
  }

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

export function toOnlineSessionListItem(
  row: OnlineSessionListEntry,
  currentSessionId: string,
): OnlineSessionListItem {
  return {
    id: row.id,
    userId: row.userId,
    username: row.username,
    nickname: row.nickname,
    createdIp: row.createdIp,
    createdIpSource: row.createdIpSource as ClientIpSource,
    userAgent: toOpsUserAgent(row.userAgent),
    createdAt: toIsoDateTime(row.createdAt),
    lastActiveAt: toIsoDateTime(row.lastActiveAt),
    expiresAt: toIsoDateTime(row.expiresAt),
    isCurrent: row.id === currentSessionId,
  }
}
