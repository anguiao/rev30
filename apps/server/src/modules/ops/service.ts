import { type LoginLogListQuery, type OnlineSessionListQuery } from '@rev30/contracts'
import type { Db } from '../../db'
import { CurrentOnlineSessionConflictError, OnlineSessionNotFoundError } from './errors'
import { toLoginLogListItem, toOnlineSessionListItem } from './mapper'
import { createOpsRepository } from './repository'

export function createOpsService(database: Db) {
  const repository = createOpsRepository(database)

  return {
    async listLoginLogs(query: LoginLogListQuery) {
      const result = await repository.listLoginLogs(query)

      return { ...result, list: result.list.map(toLoginLogListItem) }
    },

    async listOnlineSessions(query: OnlineSessionListQuery, currentSessionId: string) {
      const result = await repository.listOnlineSessions(query, new Date())

      return {
        ...result,
        list: result.list.map((row) => toOnlineSessionListItem(row, currentSessionId)),
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
