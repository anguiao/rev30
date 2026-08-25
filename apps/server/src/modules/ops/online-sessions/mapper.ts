import type { ClientIpSource, OnlineSessionListItem } from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { authSessions, systemUsers } from '../../../db/schema'
import { toOpsUserAgent } from '../user-agent'

type AuthSessionRow = typeof authSessions.$inferSelect
type UserRow = typeof systemUsers.$inferSelect

export type OnlineSessionListEntry = Pick<
  AuthSessionRow,
  'id' | 'createdIp' | 'createdIpSource' | 'userAgent' | 'createdAt' | 'lastActiveAt' | 'expiresAt'
> &
  Pick<UserRow, 'username' | 'nickname'> & {
    userId: UserRow['id']
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
