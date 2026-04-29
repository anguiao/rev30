import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { USER_STATUS_DISABLED, USER_STATUS_ENABLED } from '@rev30/shared'
import { users } from '../../db/schema'
import { createTestDb } from '../../test/db'
import { createSystemUserRoutes } from './users'

type SystemUserResponse = {
  id: string
  username: string
  nickname: string
  email: string | null
  phone: string | null
  status: 0 | 1
  createdAt: string
  updatedAt: string
}

type SystemUserListResponse = {
  total: number
  page: number
  pageSize: number
  list: SystemUserResponse[]
}

type ErrorResponse = {
  message: string
}

function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/system/users', createSystemUserRoutes(database))
}

async function createUser(
  app: Hono,
  body: {
    username: string
    nickname: string
    email?: string | null
    phone?: string | null
    status?: 0 | 1
  },
) {
  const response = await app.request('/api/system/users', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  })

  return {
    body: (await response.json()) as SystemUserResponse,
    response,
  }
}

describe('system user routes', () => {
  it('creates users in the database and returns paginated users', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body, response } = await createUser(app, {
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '10000000001',
    })

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '10000000001',
      status: USER_STATUS_ENABLED,
    })
    expect(body.createdAt).toEqual(expect.any(String))
    expect(body.updatedAt).toEqual(expect.any(String))

    const storedUsers = await database.select().from(users)
    expect(storedUsers).toHaveLength(1)
    expect(storedUsers[0]?.username).toBe('ada')

    const listResponse = await app.request('/api/system/users?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as SystemUserListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
    })
    expect(listBody.list).toHaveLength(1)
    expect(listBody.list[0]).toMatchObject({
      id: body.id,
      username: 'ada',
    })
  })

  it('returns details and updates disabled users without treating them as deleted', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body: created } = await createUser(app, {
      username: 'grace',
      nickname: 'Grace Hopper',
      status: USER_STATUS_DISABLED,
    })

    const detailResponse = await app.request(`/api/system/users/${created.id}`)
    const detailBody = (await detailResponse.json()) as SystemUserResponse

    expect(detailResponse.status).toBe(200)
    expect(detailBody).toMatchObject({
      id: created.id,
      status: USER_STATUS_DISABLED,
    })

    const updateResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Rear Admiral Grace Hopper',
        phone: '10000000002',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const updateBody = (await updateResponse.json()) as SystemUserResponse

    expect(updateResponse.status).toBe(200)
    expect(updateBody).toMatchObject({
      id: created.id,
      nickname: 'Rear Admiral Grace Hopper',
      phone: '10000000002',
      status: USER_STATUS_DISABLED,
    })
  })

  it('soft deletes users without removing database rows', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body: created } = await createUser(app, {
      username: 'alan',
      nickname: 'Alan Turing',
      email: 'alan@example.com',
      phone: '10000000003',
    })

    const deleteResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'DELETE',
    })

    expect(deleteResponse.status).toBe(204)

    const storedRows = await database.select().from(users).where(eq(users.id, created.id))
    expect(storedRows).toHaveLength(1)

    const storedUser = storedRows[0]
    if (!storedUser) {
      throw new Error('Expected stored user')
    }

    expect(storedUser.deletedAt).toBeInstanceOf(Date)
    expect(storedUser.status).toBe(USER_STATUS_ENABLED)

    const listResponse = await app.request('/api/system/users')
    expect(listResponse.status).toBe(200)
    const listBody = (await listResponse.json()) as SystemUserListResponse

    expect(listBody.total).toBe(0)
    expect(listBody.list).toEqual([])

    const detailResponse = await app.request(`/api/system/users/${created.id}`)
    expect(detailResponse.status).toBe(404)

    const secondDeleteResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'DELETE',
    })
    expect(secondDeleteResponse.status).toBe(404)
  })

  it('rejects duplicate username, email, and phone even after soft delete', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body: created } = await createUser(app, {
      username: 'margaret',
      nickname: 'Margaret Hamilton',
      email: 'margaret@example.com',
      phone: '10000000004',
    })

    for (const body of [
      {
        username: 'margaret',
        nickname: 'Duplicate Username',
      },
      {
        username: 'margaret-email',
        nickname: 'Duplicate Email',
        email: 'margaret@example.com',
      },
      {
        username: 'margaret-phone',
        nickname: 'Duplicate Phone',
        phone: '10000000004',
      },
    ]) {
      const duplicate = await createUser(app, body)
      expect(duplicate.response.status).toBe(409)
    }

    await app.request(`/api/system/users/${created.id}`, {
      method: 'DELETE',
    })

    const afterDeleteDuplicate = await createUser(app, {
      username: 'margaret-after-delete',
      nickname: 'Still Duplicate Email',
      email: 'margaret@example.com',
    })

    expect(afterDeleteDuplicate.response.status).toBe(409)
  })

  it('rejects duplicate username, email, and phone when updating users', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    await createUser(app, {
      username: 'katherine',
      nickname: 'Katherine Johnson',
      email: 'katherine@example.com',
      phone: '10000000005',
    })

    const { body: target } = await createUser(app, {
      username: 'dorothy',
      nickname: 'Dorothy Vaughan',
      email: 'dorothy@example.com',
      phone: '10000000006',
    })

    for (const body of [
      {
        username: 'katherine',
      },
      {
        email: 'katherine@example.com',
      },
      {
        phone: '10000000005',
      },
    ]) {
      const response = await app.request(`/api/system/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: {
          'content-type': 'application/json',
        },
      })

      expect(response.status).toBe(409)
    }
  })

  it('returns 400 when user id params are invalid', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const getResponse = await app.request('/api/system/users/not-a-uuid')
    const getBody = (await getResponse.json()) as ErrorResponse

    expect(getResponse.status).toBe(400)
    expect(getBody).toEqual({ message: 'Invalid user id' })

    const patchResponse = await app.request('/api/system/users/not-a-uuid', {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Invalid ID',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const patchBody = (await patchResponse.json()) as ErrorResponse

    expect(patchResponse.status).toBe(400)
    expect(patchBody).toEqual({ message: 'Invalid user id' })

    const deleteResponse = await app.request('/api/system/users/not-a-uuid', {
      method: 'DELETE',
    })
    const deleteBody = (await deleteResponse.json()) as ErrorResponse

    expect(deleteResponse.status).toBe(400)
    expect(deleteBody).toEqual({ message: 'Invalid user id' })
  })
})
