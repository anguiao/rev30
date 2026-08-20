import type { Logger } from 'pino'
import type { OperationAuditEvent, OperationAuditSink, OperationAuditWriter } from './types'

export const OPERATION_AUDIT_BUFFER_CAPACITY = 32

type CreateOperationAuditBufferOptions = {
  logger: Logger
  writer: OperationAuditWriter
}

type SafePostgresError = {
  auditErrorKind: 'connection_failure' | 'constraint_violation' | 'transaction_failure' | 'unknown'
  constraint?: string
  postgresCode?: string
}

function errorRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

function safePostgresValue(value: unknown, pattern: RegExp) {
  return typeof value === 'string' && pattern.test(value) ? value : undefined
}

function classifyPersistenceError(error: unknown): SafePostgresError {
  try {
    const outer = errorRecord(error)
    const cause = errorRecord(outer?.cause)
    const candidates = [outer, cause]
    let postgresCode: string | undefined
    let constraint: string | undefined

    for (const candidate of candidates) {
      postgresCode ??= safePostgresValue(candidate?.code, /^[0-9A-Z]{5}$/)
      constraint ??= safePostgresValue(
        candidate?.constraint ?? candidate?.constraint_name,
        /^[a-z0-9_]{1,63}$/,
      )
    }

    const auditErrorKind = postgresCode?.startsWith('23')
      ? 'constraint_violation'
      : postgresCode?.startsWith('08')
        ? 'connection_failure'
        : postgresCode?.startsWith('40')
          ? 'transaction_failure'
          : 'unknown'

    return {
      auditErrorKind,
      ...(postgresCode ? { postgresCode } : {}),
      ...(constraint ? { constraint } : {}),
    }
  } catch {
    return { auditErrorKind: 'unknown' }
  }
}

function logSafely(write: () => void) {
  try {
    write()
  } catch {
    // Audit diagnostics must not interrupt the buffer consumer.
  }
}

export type OperationAuditBuffer = OperationAuditSink & {
  stop(): void
}

export function createOperationAuditBuffer({
  logger,
  writer,
}: CreateOperationAuditBufferOptions): OperationAuditBuffer {
  const entries = new Array<OperationAuditEvent | undefined>(OPERATION_AUDIT_BUFFER_CAPACITY)
  let head = 0
  let size = 0
  let draining = false
  let stopped = false

  async function drain() {
    if (draining || stopped) {
      return
    }

    draining = true

    while (size > 0) {
      const event = entries[head]!

      try {
        await writer(event)
      } catch (error) {
        logSafely(() => {
          logger.error(
            {
              err: new Error('Operation audit persistence failed'),
              action: event.action,
              status: event.httpStatus,
              ...classifyPersistenceError(error),
            },
            'operation audit persistence failed',
          )
        })
      }

      entries[head] = undefined
      head = (head + 1) % OPERATION_AUDIT_BUFFER_CAPACITY
      size -= 1

      if (stopped) {
        break
      }
    }

    draining = false
  }

  return {
    enqueue(event) {
      if (stopped) {
        logSafely(() => {
          logger.warn({ auditErrorKind: 'stopped' }, 'operation audit enqueue failed')
        })
        return
      }

      if (size === OPERATION_AUDIT_BUFFER_CAPACITY) {
        logSafely(() => {
          logger.warn({ auditErrorKind: 'full' }, 'operation audit enqueue failed')
        })
        return
      }

      entries[(head + size) % OPERATION_AUDIT_BUFFER_CAPACITY] = event
      size += 1
      void drain()
    },

    stop() {
      if (stopped) {
        return
      }

      stopped = true
      const inFlightCount = draining && size > 0 ? 1 : 0
      const droppedCount = size - inFlightCount

      for (let offset = inFlightCount; offset < size; offset += 1) {
        entries[(head + offset) % OPERATION_AUDIT_BUFFER_CAPACITY] = undefined
      }
      size = inFlightCount

      if (droppedCount > 0) {
        logSafely(() => {
          logger.warn({ auditErrorKind: 'stopped', droppedCount }, 'operation audit buffer stopped')
        })
      }
    },
  }
}
