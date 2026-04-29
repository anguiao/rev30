import {
  systemUserCreateSchema,
  systemUserListQuerySchema,
  systemUserSchema,
  systemUserUpdateSchema,
} from '@rev30/shared'
import { Hono, type Context } from 'hono'
import { db, type Db } from '../../../db'
import {
  SystemUserConflictError,
  SystemUserNotFoundError,
  createSystemUserService,
} from './service'

function isValidUserId(id: string) {
  return systemUserSchema.shape.id.safeParse(id).success
}

function serviceErrorResponse(c: Context, error: unknown) {
  if (error instanceof SystemUserConflictError) {
    return c.json(
      {
        field: error.field,
        message: error.message,
      },
      409,
    )
  }

  if (error instanceof SystemUserNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

export function createSystemUserRoutes(database: Db = db) {
  const service = createSystemUserService(database)

  return new Hono()
    .get('/', async (c) => {
      const query = systemUserListQuerySchema.safeParse(c.req.query())

      if (!query.success) {
        return c.json({ message: 'Invalid query' }, 400)
      }

      return c.json(await service.list(query.data))
    })
    .get('/:id', async (c) => {
      const id = c.req.param('id')

      if (!isValidUserId(id)) {
        return c.json({ message: 'Invalid user id' }, 400)
      }

      try {
        return c.json(await service.get(id))
      } catch (error) {
        return serviceErrorResponse(c, error)
      }
    })
    .post('/', async (c) => {
      const body = await c.req.json().catch(() => undefined)
      const parsed = systemUserCreateSchema.safeParse(body)

      if (!parsed.success) {
        return c.json({ message: 'Invalid body' }, 400)
      }

      try {
        return c.json(await service.create(parsed.data), 201)
      } catch (error) {
        return serviceErrorResponse(c, error)
      }
    })
    .patch('/:id', async (c) => {
      const id = c.req.param('id')

      if (!isValidUserId(id)) {
        return c.json({ message: 'Invalid user id' }, 400)
      }

      const body = await c.req.json().catch(() => undefined)
      const parsed = systemUserUpdateSchema.safeParse(body)

      if (!parsed.success) {
        return c.json({ message: 'Invalid body' }, 400)
      }

      try {
        return c.json(await service.update(id, parsed.data))
      } catch (error) {
        return serviceErrorResponse(c, error)
      }
    })
    .delete('/:id', async (c) => {
      const id = c.req.param('id')

      if (!isValidUserId(id)) {
        return c.json({ message: 'Invalid user id' }, 400)
      }

      try {
        await service.delete(id)

        return new Response(null, { status: 204 })
      } catch (error) {
        return serviceErrorResponse(c, error)
      }
    })
}

export const systemUserRoutes = createSystemUserRoutes()
