import type { Db } from '../../src/db'
import {
  createApp as createProductionApp,
  type CreateAppOptions as CreateProductionAppOptions,
} from '../../src/app'
import type { OperationLogEventReceiver } from '../../src/runtime/operation-log'

const noopOperationLogReceiver: OperationLogEventReceiver = () => undefined

export type CreateTestAppOptions = Omit<CreateProductionAppOptions, 'operationLogReceiver'> & {
  operationLogReceiver?: OperationLogEventReceiver
}

export function createApp(database: Db, options: CreateTestAppOptions = {}) {
  return createProductionApp(database, {
    ...options,
    operationLogReceiver: options.operationLogReceiver ?? noopOperationLogReceiver,
  })
}
