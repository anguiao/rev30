import {
  OPERATION_LOG_RESULT_FAILURE,
  OPERATION_LOG_RESULT_SUCCESS,
  clientIpSourceSchema,
  isOperationLogCollectionAction,
  operationLogActionSchema,
  operationLogModuleSchema,
  type OperationLogAction,
  type OperationLogCollectionAction,
} from '@rev30/contracts'
import type { Context, HonoRequest, Input, MiddlewareHandler } from 'hono'
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
const optionalTargetSchema = z.string().trim().optional()
const registrationTargetSchema = z
  .object({
    targetKey: optionalTargetSchema,
    targetLabel: optionalTargetSchema,
  })
  .strict()
const operationLogRegistrationSchema = z
  .object({
    action: operationLogActionSchema,
    target: registrationTargetSchema,
  })
  .strict()
  .refine(({ action, target: { targetKey, targetLabel } }) =>
    isOperationLogCollectionAction(action)
      ? targetKey === undefined && targetLabel === undefined
      : Boolean(targetKey || targetLabel),
  )

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

type OperationLogRegistrationInput = z.input<typeof operationLogRegistrationSchema>
type OperationLogEntityAction = Exclude<OperationLogAction, OperationLogCollectionAction>
type OperationLogTarget = OperationLogRegistrationInput['target']

function registerOperation(
  c: Context<OperationLogContextEnv>,
  resolveRegistration: () => OperationLogRegistrationInput,
) {
  const registration = c.get('operationLogRegistration')

  if (registration) {
    c.set('operationLogRegistration', {
      operationLogErrorKind: 'duplicate_registration',
      requestId: registration.requestId,
    })
    return
  }

  const { requestId, clientIp, clientIpSource, userAgent } = c.get('requestContext')

  try {
    const { action, target } = operationLogRegistrationSchema.parse(resolveRegistration())
    const currentUser = c.get('currentUser')
    const [module, targetType] = action.split(':')
    const draft = operationLogDraftSchema.parse({
      actorUserId: currentUser?.id,
      actorUsername: currentUser?.username,
      actorNickname: currentUser?.nickname,
      actorIsAdmin: c.get('isAdmin'),
      actorSessionId: c.get('currentSessionId'),
      module,
      action,
      targetType,
      targetKey: target.targetKey || null,
      targetLabel: target.targetLabel || null,
      requestId,
      clientIp,
      clientIpSource,
      userAgent,
      createdAt: new Date().toISOString(),
      startedAt: performance.now(),
    })

    c.set('operationLogRegistration', draft)
  } catch {
    c.set('operationLogRegistration', {
      operationLogErrorKind: 'invalid_registration',
      requestId,
    })
  }
}

export type OperationLogInput<Validator> =
  Validator extends MiddlewareHandler<
    infer _Env,
    infer _Path,
    infer ValidatedInput,
    infer _Response
  >
    ? ValidatedInput
    : never

type OperationLogResolver<I extends Input, Value> = (
  request: Pick<HonoRequest<string, I['out']>, 'valid'>,
) => Value
type OperationLogRouteMiddleware<I extends Input = {}> = MiddlewareHandler<
  OperationLogContextEnv,
  string,
  I,
  never
>

export const operationLogIdTarget: OperationLogResolver<
  { out: { param: { id: string } } },
  OperationLogTarget
> = (request) => ({ targetKey: request.valid('param').id })

/** Registers an operation using the input made available by the preceding validators. */
export function operationLog(action: OperationLogCollectionAction): OperationLogRouteMiddleware
export function operationLog<I extends Input>(
  action: OperationLogEntityAction | OperationLogResolver<I, OperationLogEntityAction>,
  resolveTarget: OperationLogResolver<I, OperationLogTarget>,
): OperationLogRouteMiddleware<I>
export function operationLog<I extends Input>(
  action: OperationLogAction | OperationLogResolver<I, OperationLogAction>,
  resolveTarget?: OperationLogResolver<I, OperationLogTarget>,
): OperationLogRouteMiddleware<I> {
  return async (c, next) => {
    registerOperation(c, () => ({
      action: typeof action === 'function' ? action(c.req) : action,
      target: resolveTarget ? resolveTarget(c.req) : {},
    }))
    await next()
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

export function createOperationLogMiddleware(
  receiver: OperationLogEventReceiver,
  logger: Logger,
): MiddlewareHandler<OperationLogEnv> {
  return async (c, next) => {
    await next()
    const registration = c.get('operationLogRegistration')

    if (!registration) {
      return
    }

    if ('operationLogErrorKind' in registration) {
      const { operationLogErrorKind, requestId } = registration
      logger.warn({ operationLogErrorKind, requestId }, 'operation log registration discarded')
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
