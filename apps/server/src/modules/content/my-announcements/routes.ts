import {
  type AnnouncementMyListQuery,
  announcementMyListQuerySchema,
  announcementSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import type { AuthEnv } from '../../../middleware/auth'
import { MyAnnouncementNotFoundError } from './errors'
import { createMyAnnouncementService } from './service'

const announcementIdParamSchema = announcementSchema.pick({ id: true })
const myAnnouncementListRequestQuerySchema = announcementMyListQuerySchema
  .optional()
  .transform((query) => query ?? announcementMyListQuerySchema.parse({}))

const announcementIdValidator = zValidator('param', announcementIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '通知公告 ID 无效' }, 400)
  }
})

const myAnnouncementListQueryValidator = zValidator(
  'query',
  myAnnouncementListRequestQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)

function myAnnouncementErrorResponse(error: unknown, c: Context) {
  if (error instanceof MyAnnouncementNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

export function createMyAnnouncementRoutes(database: Db) {
  const service = createMyAnnouncementService(database)
  const app = new Hono<AuthEnv>()

  app.onError((error, c) => myAnnouncementErrorResponse(error, c))

  return app
    .get('/', myAnnouncementListQueryValidator, async (c) => {
      const query: AnnouncementMyListQuery = c.req.valid('query')

      return c.json(await service.list(c.get('currentUser'), query))
    })
    .get('/:id', announcementIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(c.get('currentUser'), id))
    })
}
