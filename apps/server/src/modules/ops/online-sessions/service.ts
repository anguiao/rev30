import type { OnlineSessionListQuery } from '@rev30/contracts'
import type { Db } from '../../../db'
import { CurrentOnlineSessionConflictError, OnlineSessionNotFoundError } from './errors'
import { toOnlineSessionListItem } from './mapper'
import { createOnlineSessionRepository } from './repository'

export function createOnlineSessionService(database: Db) {
  const repository = createOnlineSessionRepository(database)

  return {
    async list(query: OnlineSessionListQuery, currentSessionId: string) {
      const result = await repository.list(query, new Date())

      return {
        ...result,
        list: result.list.map((row) => toOnlineSessionListItem(row, currentSessionId)),
      }
    },

    async revoke(id: string, currentSessionId: string) {
      if (id === currentSessionId) {
        throw new CurrentOnlineSessionConflictError()
      }

      const revoked = await repository.revoke(id, new Date())

      if (!revoked) {
        throw new OnlineSessionNotFoundError()
      }
    },
  }
}
