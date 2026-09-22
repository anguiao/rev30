import {
  iconErrorCodeSchema,
  iconSetIconListQuerySchema,
  iconSetListQuerySchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AuthEnv } from '../../../../middleware/auth'
import { requireAccess } from '../../../../middleware/access'
import { listBuiltinIcons, listBuiltinIconSets } from './service'
import type { Db } from '../../../../db'

const iconSetListQueryValidator = zValidator('query', iconSetListQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '查询参数无效' }, 400)
  }
})

const iconSetIconListQueryValidator = zValidator(
  'query',
  iconSetIconListQuerySchema,
  (result, c) => {
    if (!result.success) {
      if (result.error.issues.some((issue) => issue.path[0] === 'cursor')) {
        return c.json(
          { code: iconErrorCodeSchema.enum.INVALID_ICON_CURSOR, message: '分页游标无效' },
          400,
        )
      }
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)

export function createBuiltinIconSetRoutes(database: Db) {
  return new Hono<AuthEnv>()
    .get('/', requireAccess('content:icon-set:list'), iconSetListQueryValidator, async (c) => {
      return c.json(await listBuiltinIconSets(c.req.valid('query')))
    })
    .get(
      '/icons',
      requireAccess('content:icon-set:list'),
      iconSetIconListQueryValidator,
      async (c) => {
        return c.json(await listBuiltinIcons(c.req.valid('query'), database))
      },
    )
}
