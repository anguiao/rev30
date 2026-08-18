import type {
  LoginLogListItem,
  LoginLogListQuery,
  OnlineSessionListItem,
  OnlineSessionListQuery,
} from '@rev30/contracts'
import type { Db } from '../../db'
import { CurrentOnlineSessionConflictError, OnlineSessionNotFoundError } from './errors'
import { createOpsRepository } from './repository'
import { toOpsUserAgent } from './user-agent'

function toLoginLog(
  row: Awaited<ReturnType<ReturnType<typeof createOpsRepository>['listLoginLogs']>>['list'][number],
): LoginLogListItem {
  const base = {
    id: row.id,
    username: row.username,
    requestId: row.requestId,
    clientIp: row.clientIp,
    clientIpSource: row.clientIpSource as LoginLogListItem['clientIpSource'],
    userAgent: toOpsUserAgent(row.userAgent),
    createdAt: row.createdAt.toISOString(),
  }

  if (row.result === 'success' && row.userId && row.sessionId) {
    return {
      ...base,
      userId: row.userId,
      result: 'success',
      failureReason: null,
      sessionId: row.sessionId,
    }
  }

  return {
    ...base,
    userId: row.userId,
    result: 'failure',
    failureReason: row.failureReason as Extract<
      LoginLogListItem,
      { result: 'failure' }
    >['failureReason'],
    sessionId: null,
  }
}

export function createOpsService(database: Db) {
  const repository = createOpsRepository(database)

  return {
    async listLoginLogs(query: LoginLogListQuery) {
      const result = await repository.listLoginLogs(query)

      return { ...result, list: result.list.map(toLoginLog) }
    },

    async listOnlineSessions(query: OnlineSessionListQuery, currentSessionId: string) {
      const result = await repository.listOnlineSessions(query, new Date())

      return {
        ...result,
        list: result.list.map((row): OnlineSessionListItem => ({
          ...row,
          createdIpSource: row.createdIpSource as OnlineSessionListItem['createdIpSource'],
          userAgent: toOpsUserAgent(row.userAgent),
          createdAt: row.createdAt.toISOString(),
          lastActiveAt: row.lastActiveAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          isCurrent: row.id === currentSessionId,
        })),
      }
    },

    async revokeOnlineSession(id: string, currentSessionId: string) {
      if (id === currentSessionId) {
        throw new CurrentOnlineSessionConflictError()
      }

      const revoked = await repository.revokeOnlineSession(id, new Date())

      if (!revoked) {
        throw new OnlineSessionNotFoundError()
      }
    },
  }
}
