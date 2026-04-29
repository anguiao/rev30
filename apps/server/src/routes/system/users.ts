import { randomUUID } from 'node:crypto'
import {
  type SystemUser,
  systemUserCreateSchema,
  systemUserListQuerySchema,
  systemUserSchema,
  systemUserUpdateSchema,
} from '@rev30/shared'
import { and, count, desc, eq, ilike, isNull, ne, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, type Db } from '../../db'
import { users } from '../../db/schema'

type UserRow = typeof users.$inferSelect
type UniqueField = 'username' | 'email' | 'phone'

function toSystemUser(user: UserRow): SystemUser {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    phone: user.phone,
    status: user.status as SystemUser['status'],
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

function conflictResponse(field: UniqueField) {
  return {
    field,
    message: `${field} already exists`,
  }
}

function isValidUserId(id: string) {
  return systemUserSchema.shape.id.safeParse(id).success
}

async function findUniqueConflict(
  database: Db,
  input: Partial<Record<UniqueField, string | null | undefined>>,
  excludeId?: string,
) {
  const checks = [
    input.username ? eq(users.username, input.username) : undefined,
    input.email ? eq(users.email, input.email) : undefined,
    input.phone ? eq(users.phone, input.phone) : undefined,
  ].filter((condition) => condition !== undefined)

  if (checks.length === 0) {
    return undefined
  }

  const rows = await database
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(and(or(...checks), excludeId ? ne(users.id, excludeId) : undefined))
    .limit(1)

  const conflict = rows[0]

  if (!conflict) {
    return undefined
  }

  if (input.username && conflict.username === input.username) {
    return 'username'
  }

  if (input.email && conflict.email === input.email) {
    return 'email'
  }

  if (input.phone && conflict.phone === input.phone) {
    return 'phone'
  }

  return undefined
}

export function createSystemUserRoutes(database: Db = db) {
  return new Hono()
    .get('/', async (c) => {
      const query = systemUserListQuerySchema.safeParse(c.req.query())

      if (!query.success) {
        return c.json({ message: 'Invalid query' }, 400)
      }

      const { page, pageSize, keyword, status } = query.data
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(users.deletedAt),
        status === undefined ? undefined : eq(users.status, status),
        keywordFilter
          ? or(
              ilike(users.username, keywordFilter),
              ilike(users.nickname, keywordFilter),
              ilike(users.email, keywordFilter),
              ilike(users.phone, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(users)
          .where(where)
          .orderBy(desc(users.createdAt), desc(users.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(users)
          .where(where),
      ])

      return c.json({
        list: list.map(toSystemUser),
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      })
    })
    .get('/:id', async (c) => {
      const id = c.req.param('id')

      if (!isValidUserId(id)) {
        return c.json({ message: 'Invalid user id' }, 400)
      }

      const rows = await database
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1)

      const user = rows[0]

      if (!user) {
        return c.json({ message: 'User not found' }, 404)
      }

      return c.json(toSystemUser(user))
    })
    .post('/', async (c) => {
      const body = await c.req.json().catch(() => undefined)
      const parsed = systemUserCreateSchema.safeParse(body)

      if (!parsed.success) {
        return c.json({ message: 'Invalid body' }, 400)
      }

      const conflict = await findUniqueConflict(database, parsed.data)

      if (conflict) {
        return c.json(conflictResponse(conflict), 409)
      }

      const now = new Date()
      const [created] = await database
        .insert(users)
        .values({
          id: randomUUID(),
          ...parsed.data,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (!created) {
        throw new Error('Failed to create user')
      }

      return c.json(toSystemUser(created), 201)
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

      const existing = await database
        .select({
          id: users.id,
        })
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1)

      if (!existing[0]) {
        return c.json({ message: 'User not found' }, 404)
      }

      const conflict = await findUniqueConflict(database, parsed.data, id)

      if (conflict) {
        return c.json(conflictResponse(conflict), 409)
      }

      const [updated] = await database
        .update(users)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning()

      if (!updated) {
        return c.json({ message: 'User not found' }, 404)
      }

      return c.json(toSystemUser(updated))
    })
    .delete('/:id', async (c) => {
      const id = c.req.param('id')

      if (!isValidUserId(id)) {
        return c.json({ message: 'Invalid user id' }, 400)
      }

      const now = new Date()
      const [deleted] = await database
        .update(users)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning()

      if (!deleted) {
        return c.json({ message: 'User not found' }, 404)
      }

      return new Response(null, { status: 204 })
    })
}

export const systemUserRoutes = createSystemUserRoutes()
