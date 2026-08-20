import type { Db } from '../../../db'
import { opsOperationLogs } from '../../../db/schema'
import type { OperationAuditWriter } from './types'

export function createOperationAuditWriter(database: Db): OperationAuditWriter {
  return async (event) => {
    await database.insert(opsOperationLogs).values({
      ...event,
      createdAt: new Date(event.createdAt),
    })
  }
}
