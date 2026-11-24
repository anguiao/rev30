import {
  type ScheduledJobPlanUpdateInput,
  type ScheduledJobRunsListQuery,
  scheduledJobCancelResponseSchema,
  scheduledJobEnabledInputSchema,
  scheduledJobListResponseSchema,
  scheduledJobManualExecuteOverlapResponseSchema,
  scheduledJobManualExecuteResponseSchema,
  scheduledJobPathSchema,
  scheduledJobPlanUpdateInputSchema,
  scheduledJobRunDetailSchema,
  scheduledJobRunListResponseSchema,
  scheduledJobRunPathSchema,
  scheduledJobRunsListQuerySchema,
  scheduledJobSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { requireAccess } from '../../../middleware/access'
import type { AuthEnv } from '../../../middleware/auth'
import { operationLog, type OperationLogEnv } from '../../../middleware/operation-log'
import type { RequestContextEnv } from '../../../middleware/request-context'
import {
  ScheduledJobInvalidPlanError,
  ScheduledJobNotFoundError,
  ScheduledJobStateConflictError,
} from './errors'
import type { ScheduledJobService } from './service'

const scheduledJobPathValidator = zValidator('param', scheduledJobPathSchema, (result, c) => {
  if (!result.success) return c.json({ message: '任务键无效' }, 400)
})

const scheduledJobRunPathValidator = zValidator('param', scheduledJobRunPathSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '路径参数无效' }, 400)
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

  throw error
}

export function createScheduledJobRoutes(service: ScheduledJobService) {
  const app = new Hono<AuthEnv & RequestContextEnv & OperationLogEnv>()

  app.onError((error, c) => scheduledJobErrorResponse(error, c))

  return app
    .get('/', requireAccess('ops:scheduled-job:list'), async (c) => {
      return c.json(scheduledJobListResponseSchema.parse(await service.list()))
    })
    .get(
      '/:taskKey',
      requireAccess('ops:scheduled-job:list'),
      scheduledJobPathValidator,
      async (c) => {
        const { taskKey } = c.req.valid('param')
        return c.json(scheduledJobSchema.parse(await service.get(taskKey)))
      },
    )
    .put(
      '/:taskKey',
      requireAccess('ops:scheduled-job:update'),
      scheduledJobPathValidator,
      scheduledJobPlanBodyValidator,
      (c, next) =>
        operationLog(c, next, 'ops:scheduled-job:update', () => ({
          targetKey: c.req.valid('param').taskKey,
        })),
      async (c) => {
        const { taskKey } = c.req.valid('param')
        const body: ScheduledJobPlanUpdateInput = c.req.valid('json')
        return c.json(scheduledJobSchema.parse(await service.updatePlan(taskKey, body)))
      },
    )
    .put(
      '/:taskKey/enabled',
      requireAccess('ops:scheduled-job:update'),
      scheduledJobPathValidator,
      scheduledJobEnabledBodyValidator,
      (c, next) =>
        operationLog(
          c,
          next,
          () =>
            c.req.valid('json').enabled ? 'ops:scheduled-job:enable' : 'ops:scheduled-job:disable',
          () => ({ targetKey: c.req.valid('param').taskKey }),
        ),
      async (c) => {
        const { taskKey } = c.req.valid('param')
        const body = c.req.valid('json')
        return c.json(scheduledJobSchema.parse(await service.updateEnabled(taskKey, body)))
      },
    )
    .post(
      '/:taskKey/runs',
      requireAccess('ops:scheduled-job:execute'),
      scheduledJobPathValidator,
      (c, next) =>
        operationLog(c, next, 'ops:scheduled-job:execute', () => ({
          targetKey: c.req.valid('param').taskKey,
        })),
      async (c) => {
        const { taskKey } = c.req.valid('param')
        const result = await service.runManual(taskKey, c.get('currentUser'))
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
      scheduledJobRunPathValidator,
      (c, next) =>
        operationLog(c, next, 'ops:scheduled-job:cancel', () => {
          const { taskKey, runId } = c.req.valid('param')
          return { targetKey: taskKey, targetLabel: runId }
        }),
      async (c) => {
        const { taskKey, runId } = c.req.valid('param')
        return c.json(
          scheduledJobCancelResponseSchema.parse(
            await service.cancel(taskKey, runId, c.get('currentUser')),
          ),
          202,
        )
      },
    )
}
