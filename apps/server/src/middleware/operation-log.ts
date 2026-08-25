import {
  OPERATION_LOG_RESULT_FAILURE,
  OPERATION_LOG_RESULT_SUCCESS,
  clientIpSourceSchema,
  operationLogActionSchema,
  operationLogModuleSchema,
  type OperationLogAction,
} from '@rev30/contracts'
import type { Context, MiddlewareHandler } from 'hono'
import type { Logger } from 'pino'
import { z } from 'zod'
import type { OperationLogEvent, OperationLogEventReceiver } from '../runtime/operation-log'
import type { AuthEnv } from './auth'
import type { RequestContextEnv } from './request-context'

const MAX_SNAPSHOT_LENGTH = 512

function truncateSnapshot(value: string) {
  const characters = Array.from(value)

  return characters.length <= MAX_SNAPSHOT_LENGTH
    ? value
    : `${characters.slice(0, MAX_SNAPSHOT_LENGTH - 1).join('')}…`
}

const normalizedSnapshotSchema = z.string().trim().transform(truncateSnapshot)
const requiredSnapshotSchema = normalizedSnapshotSchema.pipe(z.string().min(1))
const optionalSnapshotSchema = normalizedSnapshotSchema
  .transform((value) => value || undefined)
  .optional()
const registrationTargetSchema = z
  .object({
    targetKey: optionalSnapshotSchema,
    targetLabel: optionalSnapshotSchema,
  })
  .strict()
  .refine(({ targetKey, targetLabel }) => targetKey !== undefined || targetLabel !== undefined)

const operationLogDraftSchema = z
  .object({
    actorUserId: z.uuid(),
    actorUsername: requiredSnapshotSchema,
    actorNickname: requiredSnapshotSchema,
    actorIsAdmin: z.boolean(),
    actorSessionId: z.uuid(),
    module: operationLogModuleSchema,
    action: operationLogActionSchema,
    targetType: z.string().trim().min(1).max(MAX_SNAPSHOT_LENGTH),
    targetKey: requiredSnapshotSchema.nullable(),
    targetLabel: requiredSnapshotSchema.nullable(),
    requestId: z.uuid(),
    clientIp: z.string().nullable(),
    clientIpSource: clientIpSourceSchema,
    userAgent: z.string().min(1).max(MAX_SNAPSHOT_LENGTH).nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.number(),
  })
  .strict()

type OperationLogDraft = z.infer<typeof operationLogDraftSchema>

type OperationLogRegistrationFailure = {
  operationLogErrorKind: 'duplicate_registration' | 'invalid_registration'
  requestId: string
}

type OperationLogVariables = {
  operationLogRegistration?: OperationLogDraft | OperationLogRegistrationFailure
}

export type OperationLogEnv = {
  Variables: OperationLogVariables
}

type OperationLogContextEnv = AuthEnv & RequestContextEnv & OperationLogEnv

type OperationLogTarget = {
  targetKey?: string
  targetLabel?: string
}

type CreateOperationLogMiddlewareOptions = {
  logger: Logger
  receiver: OperationLogEventReceiver
}

export function recordOperation(
  c: Context<OperationLogContextEnv>,
  action: OperationLogAction,
  target: OperationLogTarget,
) {
  const registration = c.get('operationLogRegistration')

  if (registration) {
    c.set('operationLogRegistration', {
      operationLogErrorKind: 'duplicate_registration',
      requestId: registration.requestId,
    })
    return
  }

  try {
    const parsedAction = operationLogActionSchema.parse(action)
    const parsedTarget = registrationTargetSchema.parse(target)
    const requestContext = c.get('requestContext')
    const currentUser = c.get('currentUser')
    const [module, targetType] = parsedAction.split(':')
    const draft = operationLogDraftSchema.parse({
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
      createdAt: new Date().toISOString(),
      startedAt: performance.now(),
    })

    c.set('operationLogRegistration', draft)
  } catch {
    c.set('operationLogRegistration', {
      operationLogErrorKind: 'invalid_registration',
      requestId: c.get('requestContext').requestId,
    })
  }
}

function createOperationLogEvent(
  draft: OperationLogDraft,
  httpStatus: number,
  durationMs: number,
): OperationLogEvent {
  return {
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
    result:
      httpStatus >= 200 && httpStatus <= 299
        ? OPERATION_LOG_RESULT_SUCCESS
        : OPERATION_LOG_RESULT_FAILURE,
    httpStatus,
    durationMs,
    requestId: draft.requestId,
    clientIp: draft.clientIp,
    clientIpSource: draft.clientIpSource,
    userAgent: draft.userAgent,
    createdAt: draft.createdAt,
  }
}

export function createOperationLogMiddleware({
  logger,
  receiver,
}: CreateOperationLogMiddlewareOptions): MiddlewareHandler<RequestContextEnv & OperationLogEnv> {
  return async (c, next) => {
    await next()
    const registration = c.get('operationLogRegistration')

    if (!registration) {
      return
    }

    if ('operationLogErrorKind' in registration) {
      logger.warn(registration, 'operation log registration discarded')
      return
    }

    const draft = registration

    try {
      const durationMs = Math.floor(performance.now() - draft.startedAt)

      if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
        throw new Error('Invalid operation log duration')
      }

      receiver(createOperationLogEvent(draft, c.res.status, durationMs))
    } catch {
      logger.error(
        {
          operationLogErrorKind: 'finalization_error',
          requestId: draft.requestId,
        },
        'operation log finalization failed',
      )
    }
  }
}
