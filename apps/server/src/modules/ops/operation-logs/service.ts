import type { OperationLogListQuery } from '@rev30/contracts'
import type { Db } from '../../../db'
import { OperationLogNotFoundError } from './errors'
import { toOperationLogDetail, toOperationLogListItem } from './mapper'
import { createOperationLogRepository } from './repository'

export function createOperationLogService(database: Db) {
  const repository = createOperationLogRepository(database)

  return {
    async list(query: OperationLogListQuery) {
      const result = await repository.list(query)

      return { ...result, list: result.list.map(toOperationLogListItem) }
    },

    async get(id: string) {
      const row = await repository.findById(id)

      if (!row) {
        throw new OperationLogNotFoundError()
      }

      return toOperationLogDetail(row)
    },
  }
}
