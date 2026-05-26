import {
  type AnnouncementCreateInput,
  type AnnouncementListQuery,
  type AnnouncementUpdateInput,
  announcementCreateSchema,
  announcementListQuerySchema,
  announcementSchema,
  announcementUpdateSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import {
  AnnouncementContentInvalidError,
  AnnouncementDraftArchiveError,
  AnnouncementEmptyContentError,
  AnnouncementInvalidTargetError,
  AnnouncementNotFoundError,
  AnnouncementVisibilityTargetRequiredError,
} from './errors'
import { createMyAnnouncementRoutes } from './my/routes'
import { createAnnouncementService } from './service'

const announcementIdParamSchema = announcementSchema.pick({ id: true })
const announcementListRequestQuerySchema = announcementListQuerySchema
  .optional()
  .transform((query) => query ?? announcementListQuerySchema.parse({}))

const announcementIdValidator = zValidator('param', announcementIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '通知公告 ID 无效' }, 400)
  }
})

const announcementListQueryValidator = zValidator(
  'query',
  announcementListRequestQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)

const announcementCreateBodyValidator = zValidator(
  'json',
  announcementCreateSchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '请求体无效' }, 400)
    }
  },
)

const announcementUpdateBodyValidator = zValidator(
  'json',
  announcementUpdateSchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '请求体无效' }, 400)
    }
  },
)

function announcementErrorResponse(error: unknown, c: Context) {
  if (
    error instanceof AnnouncementEmptyContentError ||
    error instanceof AnnouncementContentInvalidError ||
    error instanceof AnnouncementVisibilityTargetRequiredError ||
    error instanceof AnnouncementInvalidTargetError
  ) {
    return c.json({ field: error.field, message: error.message }, 400)
  }

  if (error instanceof AnnouncementDraftArchiveError) {
    return c.json({ message: error.message }, 400)
  }

  if (error instanceof AnnouncementNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

export function createAnnouncementRoutes(database: Db) {
  const service = createAnnouncementService(database)
  const app = new Hono()

  app.onError((error, c) => announcementErrorResponse(error, c))

  return app
    .route('/my', createMyAnnouncementRoutes(database))
    .get(
      '/',
      requireAccess('content:announcement:list'),
      announcementListQueryValidator,
      async (c) => {
        const query: AnnouncementListQuery = c.req.valid('query')

        return c.json(await service.list(query))
      },
    )
    .get('/:id', requireAccess('content:announcement:list'), announcementIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(id))
    })
    .post(
      '/',
      requireAccess('content:announcement:create'),
      announcementCreateBodyValidator,
      async (c) => {
        const body: AnnouncementCreateInput = c.req.valid('json')

        return c.json(await service.create(body), 201)
      },
    )
    .patch(
      '/:id',
      requireAccess('content:announcement:update'),
      announcementIdValidator,
      announcementUpdateBodyValidator,
      async (c) => {
        const { id } = c.req.valid('param')
        const body: AnnouncementUpdateInput = c.req.valid('json')

        return c.json(await service.update(id, body))
      },
    )
    .post(
      '/:id/publish',
      requireAccess('content:announcement:update'),
      announcementIdValidator,
      async (c) => {
        const { id } = c.req.valid('param')

        await service.publish(id)

        return c.body(null, 204)
      },
    )
    .post(
      '/:id/archive',
      requireAccess('content:announcement:update'),
      announcementIdValidator,
      async (c) => {
        const { id } = c.req.valid('param')

        await service.archive(id)

        return c.body(null, 204)
      },
    )
    .delete(
      '/:id',
      requireAccess('content:announcement:delete'),
      announcementIdValidator,
      async (c) => {
        const { id } = c.req.valid('param')

        await service.delete(id)

        return c.body(null, 204)
      },
    )
}
