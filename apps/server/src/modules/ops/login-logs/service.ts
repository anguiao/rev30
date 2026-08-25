import type { LoginLogListQuery } from '@rev30/contracts'
import type { Db } from '../../../db'
import { toLoginLogListItem } from './mapper'
import { createLoginLogRepository } from './repository'

export function createLoginLogService(database: Db) {
  const repository = createLoginLogRepository(database)

  return {
    async list(query: LoginLogListQuery) {
      const result = await repository.list(query)

      return { ...result, list: result.list.map(toLoginLogListItem) }
    },
  }
}
