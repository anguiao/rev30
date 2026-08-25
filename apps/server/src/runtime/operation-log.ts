import type {
  ClientIpSource,
  OperationLogAction,
  OperationLogModule,
  OperationLogResult,
} from '@rev30/contracts'
import type { Logger } from 'pino'
import type { Db } from '../db'
import { opsOperationLogs } from '../db/schema'

export type OperationLogEvent = Readonly<{
  actorUserId: string
  actorUsername: string
  actorNickname: string
  actorIsAdmin: boolean
  actorSessionId: string
  module: OperationLogModule
  action: OperationLogAction
  targetType: string
  targetKey: string | null
  targetLabel: string | null
  result: OperationLogResult
  httpStatus: number
  durationMs: number
  requestId: string
  clientIp: string | null
  clientIpSource: ClientIpSource
  userAgent: string | null
  createdAt: string
}>

export type OperationLogEventReceiver = (event: OperationLogEvent) => void

const OPERATION_LOG_BUFFER_CAPACITY = 32

async function writeOperationLogEvent(database: Db, event: OperationLogEvent) {
  await database.insert(opsOperationLogs).values({
    ...event,
    createdAt: new Date(event.createdAt),
  })
}

export function createOperationLogRuntime(database: Db, logger: Logger) {
  const entries: OperationLogEvent[] = []
  let draining = false
  let stopped = false

  async function drain() {
    if (draining || stopped) {
      return
    }

    draining = true

    while (entries.length > 0) {
      const event = entries[0]!

      try {
        await writeOperationLogEvent(database, event)
      } catch {
        logger.error(
          {
            err: new Error('Operation log persistence failed'),
            action: event.action,
            operationLogErrorKind: 'persistence_failure',
            requestId: event.requestId,
            status: event.httpStatus,
          },
          'operation log persistence failed',
        )
      }

      entries.shift()

      if (stopped) {
        break
      }
    }

    draining = false
  }

  return {
    receiver: (event: OperationLogEvent) => {
      if (stopped) {
        logger.warn({ operationLogErrorKind: 'stopped' }, 'operation log enqueue failed')
        return
      }

      if (entries.length === OPERATION_LOG_BUFFER_CAPACITY) {
        logger.warn({ operationLogErrorKind: 'full' }, 'operation log enqueue failed')
        return
      }

      entries.push(event)
      void drain()
    },

    stop() {
      if (stopped) {
        return
      }

      stopped = true
      const inFlightCount = draining && entries.length > 0 ? 1 : 0
      const droppedCount = entries.length - inFlightCount
      entries.length = inFlightCount

      if (droppedCount > 0) {
        logger.warn(
          { operationLogErrorKind: 'stopped', droppedCount },
          'operation log buffer stopped',
        )
      }
    },
  }
}
