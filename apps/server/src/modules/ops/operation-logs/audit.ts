import {
  clientIpSourceSchema,
  operationLogActionSchema,
  operationLogModuleSchema,
  type OperationLogAction,
} from '@rev30/contracts'
import type { Context, MiddlewareHandler } from 'hono'
import type { Logger } from 'pino'
import { z } from 'zod'
import type { AuthVariables } from '../../../middleware/auth'
import type { RequestContextEnv } from '../../../middleware/request-context'
import type { OperationAuditEvent, OperationAuditSink } from './types'

const maxSnapshotLength = 512

function normalizeSnapshot(value: string) {
  const normalized = value.trim()
  const characters = normalized.match(/./gu) ?? []

  if (characters.length <= maxSnapshotLength) {
    return normalized
  }

  return `${characters.slice(0, maxSnapshotLength - 1).join('')}…`
}

const boundedNormalizedStringSchema = z
  .string()
  .min(1)
  .refine((value) => (value.match(/./gu)?.length ?? 0) <= maxSnapshotLength)
const boundedSnapshotSchema = z
  .string()
  .transform(normalizeSnapshot)
  .pipe(boundedNormalizedStringSchema)
const optionalTargetSchema = z
  .string()
  .transform((value) => normalizeSnapshot(value) || undefined)
  .optional()
const markerTargetSchema = z
  .object({
    targetKey: optionalTargetSchema,
    targetLabel: optionalTargetSchema,
  })
  .strict()
  .refine(({ targetKey, targetLabel }) => targetKey !== undefined || targetLabel !== undefined)

const operationAuditDraftSchema = z
  .object({
    actorUserId: z.uuid(),
    actorUsername: boundedSnapshotSchema,
    actorNickname: boundedSnapshotSchema,
    actorIsAdmin: z.boolean(),
    actorSessionId: z.uuid(),
    module: operationLogModuleSchema,
    action: operationLogActionSchema,
    targetType: z.string().trim().min(1).max(maxSnapshotLength),
    targetKey: boundedNormalizedStringSchema.nullable(),
    targetLabel: boundedNormalizedStringSchema.nullable(),
    requestId: z.uuid(),
    clientIp: z.string().nullable(),
    clientIpSource: clientIpSourceSchema,
    userAgent: z.string().min(1).max(maxSnapshotLength).nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.number(),
  })
  .strict()

type OperationAuditDraft = z.infer<typeof operationAuditDraftSchema>

type OperationAuditState =
  | { status: 'unmarked' }
  | { status: 'marked'; draft: OperationAuditDraft }
  | {
      status: 'discarded'
      auditErrorKind: 'duplicate_mark' | 'invalid_registration'
      requestId?: string
    }

type OperationAuditSlot = {
  state: OperationAuditState
  monotonicNow: () => number
  now: () => Date
}

export type OperationAuditVariables = {
  operationAudit: OperationAuditSlot
}

export type OperationAuditEnv = {
  Variables: OperationAuditVariables
}

type OperationAuditMarkEnv = {
  Variables: OperationAuditVariables & RequestContextEnv['Variables'] & AuthVariables
}

export type OperationAuditTarget = {
  targetKey?: string
  targetLabel?: string
}

type CreateOperationAuditMiddlewareOptions = {
  logger: Logger
  sink: OperationAuditSink
  monotonicNow?: () => number
  now?: () => Date
}

function safeRequestId(value: unknown) {
  const result = z.uuid().safeParse(value)
  return result.success ? result.data : undefined
}

export function markOperationAudit(
  c: Context<OperationAuditMarkEnv>,
  action: OperationLogAction,
  target: OperationAuditTarget,
) {
  const slot = c.get('operationAudit')

  if (!slot) {
    return
  }

  if (slot.state.status !== 'unmarked') {
    const requestId =
      slot.state.status === 'marked' ? slot.state.draft.requestId : slot.state.requestId
    slot.state = {
      status: 'discarded',
      auditErrorKind: 'duplicate_mark',
      ...(requestId ? { requestId } : {}),
    }
    return
  }

  try {
    const parsedAction = operationLogActionSchema.parse(action)
    const parsedTarget = markerTargetSchema.parse(target)
    const requestContext = c.get('requestContext')
    const currentUser = c.get('currentUser')
    const [module, targetType] = parsedAction.split(':')
    const draft = operationAuditDraftSchema.parse({
      actorUserId: currentUser?.id,
      actorUsername: currentUser?.username,
      actorNickname: currentUser?.nickname,
      actorIsAdmin: c.get('isAdmin'),
      actorSessionId: c.get('currentSessionId'),
      module,
      action: parsedAction,
      targetType,
      targetKey: parsedTarget.targetKey ?? null,
      targetLabel: parsedTarget.targetLabel ?? null,
      requestId: requestContext?.requestId,
      clientIp: requestContext?.clientIp,
      clientIpSource: requestContext?.clientIpSource,
      userAgent: requestContext?.userAgent,
      createdAt: slot.now().toISOString(),
      startedAt: slot.monotonicNow(),
    })

    slot.state = { status: 'marked', draft }
  } catch {
    const requestId = safeRequestId(c.get('requestContext')?.requestId)
    slot.state = {
      status: 'discarded',
      auditErrorKind: 'invalid_registration',
      ...(requestId ? { requestId } : {}),
    }
  }
}

function diagnosticFields(state: Extract<OperationAuditState, { status: 'discarded' }>) {
  return {
    auditErrorKind: state.auditErrorKind,
    ...(state.requestId ? { requestId: state.requestId } : {}),
  }
}

function logSafely(write: () => void) {
  try {
    write()
  } catch {
    // Audit diagnostics must never change the business response.
  }
}

export function createOperationAuditMiddleware({
  logger,
  sink,
  monotonicNow = performance.now.bind(performance),
  now = () => new Date(),
}: CreateOperationAuditMiddlewareOptions): MiddlewareHandler<
  RequestContextEnv & OperationAuditEnv
> {
  return async (c, next) => {
    const slot: OperationAuditSlot = {
      state: { status: 'unmarked' },
      monotonicNow,
      now,
    }
    c.set('operationAudit', slot)

    await next()
    const state = slot.state

    if (state.status === 'unmarked') {
      return
    }

    if (state.status === 'discarded') {
      logSafely(() => {
        logger.warn(diagnosticFields(state), 'operation audit registration discarded')
      })
      return
    }

    const { draft } = state

    try {
      const durationMs = Math.floor(monotonicNow() - draft.startedAt)

      if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
        throw new Error('Invalid operation audit duration')
      }

      const event: OperationAuditEvent = Object.freeze({
        actorUserId: draft.actorUserId,
        actorUsername: draft.actorUsername,
        actorNickname: draft.actorNickname,
        actorIsAdmin: draft.actorIsAdmin,
        actorSessionId: draft.actorSessionId,
        module: draft.module,
        action: draft.action,
        targetType: draft.targetType,
        targetKey: draft.targetKey,
        targetLabel: draft.targetLabel,
        result: c.res.status >= 200 && c.res.status <= 299 ? 'success' : 'failure',
        httpStatus: c.res.status,
        durationMs,
        requestId: draft.requestId,
        clientIp: draft.clientIp,
        clientIpSource: draft.clientIpSource,
        userAgent: draft.userAgent,
        createdAt: draft.createdAt,
      })

      sink.enqueue(event)
    } catch {
      logSafely(() => {
        logger.error(
          {
            auditErrorKind: 'sink_error',
            requestId: draft.requestId,
          },
          'operation audit finalization failed',
        )
      })
    }
  }
}
