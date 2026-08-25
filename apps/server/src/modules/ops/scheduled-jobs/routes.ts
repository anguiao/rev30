import {
  type ScheduledJobPlanUpdateInput,
  type ScheduledJobRunsListQuery,
  scheduledJobCancelInputSchema,
  scheduledJobCancelResponseSchema,
  scheduledJobEnabledInputSchema,
  scheduledJobEnabledResponseSchema,
  scheduledJobListResponseSchema,
  scheduledJobManualExecuteInputSchema,
  scheduledJobManualExecuteOverlapResponseSchema,
  scheduledJobManualExecuteResponseSchema,
  scheduledJobPathSchema,
  scheduledJobPlanUpdateInputSchema,
  scheduledJobRunDetailSchema,
  scheduledJobRunListResponseSchema,
  scheduledJobRunPathSchema,
  scheduledJobRunsListQuerySchema,
  scheduledJobUpdateResponseSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import type { ZodType } from 'zod'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import type { AuthEnv } from '../../../middleware/auth'
import { createBodyLimit } from '../../../middleware/body-limit'
import { recordOperation, type OperationLogEnv } from '../../../middleware/operation-log'
import type { RequestContextEnv } from '../../../middleware/request-context'
import { ScheduledJobInvalidPlanError } from './errors'
import {
  ScheduledJobNotFoundError,
  ScheduledJobStateConflictError,
  type ScheduledJobActorSnapshot,
} from './repository'
import { createScheduledJobService } from './service'
import { ScheduledJobRuntimeStoppedError, type ScheduledJobRuntimeCommands } from './runtime'

const scheduledJobPathValidator = zValidator('param', scheduledJobPathSchema, (result, c) => {
  if (!result.success) return c.json({ message: '任务键无效' }, 400)
})

const scheduledJobRunPathValidator = zValidator('param', scheduledJobRunPathSchema, (result, c) => {
  if (!result.success) {
    const issue = result.error.issues[0]
    return c.json(
      {
        message: issue?.path[0] === 'runId' ? '任务运行 ID 无效' : '任务键无效',
      },
      400,
    )
  }
})

const scheduledJobRunsQueryValidator = zValidator(
  'query',
  scheduledJobRunsListQuerySchema,
  (result, c) => {
    if (!result.success) return c.json({ message: '请求参数无效' }, 400)
  },
)

const scheduledJobPlanBodyValidator = zValidator(
  'json',
  scheduledJobPlanUpdateInputSchema,
  (result, c) => {
    if (!result.success) return c.json({ message: '请求体无效' }, 400)
  },
)

const scheduledJobEnabledBodyValidator = zValidator(
  'json',
  scheduledJobEnabledInputSchema,
  (result, c) => {
    if (!result.success) return c.json({ message: '请求体无效' }, 400)
  },
)

function optionalEmptyJsonBodyValidator(schema: ZodType): MiddlewareHandler {
  return async (c, next) => {
    const text = await c.req.text()
    if (text.trim() === '') {
      await next()
      return
    }

    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      return c.json({ message: '请求体无效' }, 400)
    }

    if (!schema.safeParse(value).success) {
      return c.json({ message: '请求体无效' }, 400)
    }

    await next()
  }
}

const scheduledJobManualBodyValidator = optionalEmptyJsonBodyValidator(
  scheduledJobManualExecuteInputSchema,
)

const scheduledJobCancelBodyValidator = optionalEmptyJsonBodyValidator(
  scheduledJobCancelInputSchema,
)
const scheduledJobCommandBodyLimit = createBodyLimit(1024)

function scheduledJobErrorResponse(error: unknown, c: Context) {
  if (error instanceof ScheduledJobInvalidPlanError) {
    return c.json({ message: error.message }, 400)
  }

  if (error instanceof ScheduledJobNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  if (error instanceof ScheduledJobStateConflictError) {
    return c.json({ message: error.message }, 409)
  }

  if (error instanceof ScheduledJobRuntimeStoppedError) {
    throw error
  }

  throw error
}

function actorSnapshot(c: Context<AuthEnv & RequestContextEnv>) {
  const user = c.get('currentUser')
  const requestContext = c.get('requestContext')
  return {
    userId: user.id,
    username: user.username,
    nickname: user.nickname,
    sessionId: c.get('currentSessionId'),
    requestId: requestContext.requestId,
  } satisfies ScheduledJobActorSnapshot
}

export function createScheduledJobRoutes(database: Db, runtime: ScheduledJobRuntimeCommands) {
  const service = createScheduledJobService(database, runtime)
  const app = new Hono<AuthEnv & RequestContextEnv & OperationLogEnv>()

  app.onError((error, c) => scheduledJobErrorResponse(error, c))

  return app
    .get('/', requireAccess('ops:scheduled-job:list'), async (c) => {
      return c.json(scheduledJobListResponseSchema.parse(await service.list()))
    })
    .put(
      '/:taskKey',
      requireAccess('ops:scheduled-job:update'),
      scheduledJobPathValidator,
      scheduledJobPlanBodyValidator,
      async (c) => {
        const { taskKey } = c.req.valid('param')
        const body: ScheduledJobPlanUpdateInput = c.req.valid('json')
        recordOperation(c, 'ops:scheduled-job:update', { targetKey: taskKey })
        return c.json(
          scheduledJobUpdateResponseSchema.parse(await service.updatePlan(taskKey, body)),
        )
      },
    )
    .put(
      '/:taskKey/enabled',
      requireAccess('ops:scheduled-job:update'),
      scheduledJobPathValidator,
      scheduledJobEnabledBodyValidator,
      async (c) => {
        const { taskKey } = c.req.valid('param')
        const body = c.req.valid('json')
        recordOperation(
          c,
          body.enabled ? 'ops:scheduled-job:enable' : 'ops:scheduled-job:disable',
          {
            targetKey: taskKey,
          },
        )
        return c.json(
          scheduledJobEnabledResponseSchema.parse(await service.updateEnabled(taskKey, body)),
        )
      },
    )
    .post(
      '/:taskKey/runs',
      requireAccess('ops:scheduled-job:execute'),
      scheduledJobCommandBodyLimit,
      scheduledJobPathValidator,
      scheduledJobManualBodyValidator,
      async (c) => {
        const { taskKey } = c.req.valid('param')
        recordOperation(c, 'ops:scheduled-job:execute', { targetKey: taskKey })
        const result = await service.runManual(taskKey, actorSnapshot(c))
        if ('runId' in result) {
          return c.json(scheduledJobManualExecuteResponseSchema.parse(result), 202)
        }
        return c.json(scheduledJobManualExecuteOverlapResponseSchema.parse(result), 409)
      },
    )
    .get(
      '/:taskKey/runs',
      requireAccess('ops:scheduled-job:list'),
      scheduledJobPathValidator,
      scheduledJobRunsQueryValidator,
      async (c) => {
        const { taskKey } = c.req.valid('param')
        const query: ScheduledJobRunsListQuery = c.req.valid('query')
        return c.json(
          scheduledJobRunListResponseSchema.parse(await service.listRuns(taskKey, query)),
        )
      },
    )
    .get(
      '/:taskKey/runs/:runId',
      requireAccess('ops:scheduled-job:list'),
      scheduledJobRunPathValidator,
      async (c) => {
        const { taskKey, runId } = c.req.valid('param')
        return c.json(scheduledJobRunDetailSchema.parse(await service.getRun(taskKey, runId)))
      },
    )
    .post(
      '/:taskKey/runs/:runId/cancel',
      requireAccess('ops:scheduled-job:cancel'),
      scheduledJobCommandBodyLimit,
      scheduledJobRunPathValidator,
      scheduledJobCancelBodyValidator,
      async (c) => {
        const { taskKey, runId } = c.req.valid('param')
        recordOperation(c, 'ops:scheduled-job:cancel', {
          targetKey: taskKey,
          targetLabel: runId,
        })
        return c.json(
          scheduledJobCancelResponseSchema.parse(
            await service.cancel(taskKey, runId, actorSnapshot(c)),
          ),
          202,
        )
      },
    )
}
