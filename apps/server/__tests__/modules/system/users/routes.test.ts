import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  type User,
  type UserListResponse,
  type UserStatus,
} from '@rev30/shared'
import { departments, userDepartments, users } from '../../../../src/db/schema'
import { createTestDb } from '../../../helpers/db'
import { createUserRoutes } from '../../../../src/modules/system/users/routes'

type ErrorResponse = {
  message: string
}

function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/system/users', createUserRoutes(database))
}

async function createUser(
  app: Hono,
  body: {
    username: string
    nickname: string
    email?: string | null
    phone?: string | null
    status?: UserStatus
    departmentIds?: string[]
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
    body: (await response.json()) as User,
    response,
  }
}

async function createDepartment(
  database: Awaited<ReturnType<typeof createTestDb>>,
  input: { name: string; code: string; deletedAt?: Date | null },
) {
  const now = new Date()
  const [department] = await database
    .insert(departments)
    .values({
      id: randomUUID(),
      name: input.name,
      code: input.code,
      deletedAt: input.deletedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!department) {
    throw new Error('Expected department')
  }

  return department
}

describe('user routes', () => {
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
      departments: [],
    })
    expect(body.createdAt).toEqual(expect.any(String))
    expect(body.updatedAt).toEqual(expect.any(String))

    const storedUsers = await database.select().from(users)
    expect(storedUsers).toHaveLength(1)
    expect(storedUsers[0]?.username).toBe('ada')

    const listResponse = await app.request('/api/system/users?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as UserListResponse

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
      departments: [],
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
    const detailBody = (await detailResponse.json()) as User

    expect(detailResponse.status).toBe(200)
    expect(detailBody).toMatchObject({
      id: created.id,
      status: USER_STATUS_DISABLED,
      departments: [],
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
    const updateBody = (await updateResponse.json()) as User

    expect(updateResponse.status).toBe(200)
    expect(updateBody).toMatchObject({
      id: created.id,
      nickname: 'Rear Admiral Grace Hopper',
      phone: '10000000002',
      status: USER_STATUS_DISABLED,
      departments: [],
    })
  })

  it('creates users with multiple departments and returns department summaries', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const engineering = await createDepartment(database, {
      name: 'Engineering',
      code: 'engineering',
    })
    const product = await createDepartment(database, {
      name: 'Product',
      code: 'product',
    })

    const { body, response } = await createUser(app, {
      username: 'department-user',
      nickname: 'Department User',
      departmentIds: [engineering.id, product.id],
    })

    expect(response.status).toBe(201)
    expect(body.departments).toEqual([
      {
        id: engineering.id,
        name: 'Engineering',
        code: 'engineering',
      },
      {
        id: product.id,
        name: 'Product',
        code: 'product',
      },
    ])

    const detailResponse = await app.request(`/api/system/users/${body.id}`)
    const detailBody = (await detailResponse.json()) as User
    expect(detailResponse.status).toBe(200)
    expect(detailBody.departments).toEqual(body.departments)

    const listResponse = await app.request('/api/system/users?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as UserListResponse
    expect(listResponse.status).toBe(200)
    expect(listBody.list).toHaveLength(1)
    expect(listBody.list[0]?.departments).toEqual(body.departments)

    const storedRelations = await database.select().from(userDepartments)
    expect(storedRelations).toHaveLength(2)
  })

  it('replaces and clears user departments on update', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const engineering = await createDepartment(database, {
      name: 'Engineering',
      code: 'engineering',
    })
    const product = await createDepartment(database, {
      name: 'Product',
      code: 'product',
    })

    const { body: created } = await createUser(app, {
      username: 'department-update-user',
      nickname: 'Department Update User',
      departmentIds: [engineering.id],
    })

    const replaceResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        departmentIds: [product.id],
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const replaceBody = (await replaceResponse.json()) as User

    expect(replaceResponse.status).toBe(200)
    expect(replaceBody.departments).toEqual([
      {
        id: product.id,
        name: 'Product',
        code: 'product',
      },
    ])

    const updateNicknameResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Department Update User v2',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const updateNicknameBody = (await updateNicknameResponse.json()) as User

    expect(updateNicknameResponse.status).toBe(200)
    expect(updateNicknameBody.departments).toEqual([
      {
        id: product.id,
        name: 'Product',
        code: 'product',
      },
    ])

    const clearResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        departmentIds: [],
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const clearBody = (await clearResponse.json()) as User

    expect(clearResponse.status).toBe(200)
    expect(clearBody.departments).toEqual([])
  })

  it('rejects missing or deleted department ids on user create and update', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const deletedDepartment = await createDepartment(database, {
      name: 'Deleted',
      code: 'deleted',
      deletedAt: new Date(),
    })
    const missingDepartmentId = randomUUID()
    const invalidDepartmentIds = [deletedDepartment.id, missingDepartmentId]

    for (const [index, departmentId] of invalidDepartmentIds.entries()) {
      const createResponse = await app.request('/api/system/users', {
        method: 'POST',
        body: JSON.stringify({
          username: `invalid-create-user-${index}`,
          nickname: `Invalid Create User ${index}`,
          departmentIds: [departmentId],
        }),
        headers: {
          'content-type': 'application/json',
        },
      })
      const createBody = (await createResponse.json()) as ErrorResponse

      expect(createResponse.status).toBe(400)
      expect(createBody).toEqual({ message: '部门不存在' })
    }

    const { body: validUser } = await createUser(app, {
      username: 'valid-for-invalid-update',
      nickname: 'Valid For Invalid Update',
    })

    for (const departmentId of invalidDepartmentIds) {
      const updateResponse = await app.request(`/api/system/users/${validUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          departmentIds: [departmentId],
        }),
        headers: {
          'content-type': 'application/json',
        },
      })
      const updateBody = (await updateResponse.json()) as ErrorResponse

      expect(updateResponse.status).toBe(400)
      expect(updateBody).toEqual({ message: '部门不存在' })
    }
  })

  it('returns not found when updating a missing user before validating department ids', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const missingUserId = randomUUID()
    const missingDepartmentId = randomUUID()

    const response = await app.request(`/api/system/users/${missingUserId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        departmentIds: [missingDepartmentId],
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const body = (await response.json()) as ErrorResponse

    expect(response.status).toBe(404)
    expect(body).toEqual({ message: '用户不存在' })
  })

  it('soft deletes users without removing database rows', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const department = await createDepartment(database, {
      name: 'Research',
      code: 'research',
    })

    const { body: created } = await createUser(app, {
      username: 'alan',
      nickname: 'Alan Turing',
      email: 'alan@example.com',
      phone: '10000000003',
      departmentIds: [department.id],
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

    const storedRelations = await database
      .select()
      .from(userDepartments)
      .where(eq(userDepartments.userId, created.id))
    expect(storedRelations).toEqual([])

    const listResponse = await app.request('/api/system/users')
    expect(listResponse.status).toBe(200)
    const listBody = (await listResponse.json()) as UserListResponse

    expect(listBody.total).toBe(0)
    expect(listBody.list).toEqual([])

    const detailResponse = await app.request(`/api/system/users/${created.id}`)
    expect(detailResponse.status).toBe(404)
    expect(await detailResponse.json()).toEqual({
      message: '用户不存在',
    })

    const secondDeleteResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'DELETE',
    })
    expect(secondDeleteResponse.status).toBe(404)
    expect(await secondDeleteResponse.json()).toEqual({
      message: '用户不存在',
    })
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

  it('returns conflict when concurrent creates hit the username unique index', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const body = JSON.stringify({
      username: 'race',
      nickname: 'Race User',
    })
    const createRaceUser = () =>
      app.request('/api/system/users', {
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/json',
        },
      })

    const responses = await Promise.all([createRaceUser(), createRaceUser()])
    const statuses = responses.map((response) => response.status).sort()

    expect(statuses).toEqual([201, 409])
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

  it('returns conflict when concurrent updates hit the username unique index', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: first } = await createUser(app, {
      username: 'first-update-target',
      nickname: 'First Update Target',
    })
    const { body: second } = await createUser(app, {
      username: 'second-update-target',
      nickname: 'Second Update Target',
    })
    const body = JSON.stringify({
      username: 'shared-update-target',
    })
    const updateUser = (id: string) =>
      app.request(`/api/system/users/${id}`, {
        method: 'PATCH',
        body,
        headers: {
          'content-type': 'application/json',
        },
      })

    const responses = await Promise.all([updateUser(first.id), updateUser(second.id)])
    const statuses = responses.map((response) => response.status).sort()

    expect(statuses).toEqual([200, 409])
  })

  it('returns 400 when user id params are invalid', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const getResponse = await app.request('/api/system/users/not-a-uuid')
    const getBody = (await getResponse.json()) as ErrorResponse

    expect(getResponse.status).toBe(400)
    expect(getBody).toEqual({ message: '用户 ID 无效' })

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
    expect(patchBody).toEqual({ message: '用户 ID 无效' })

    const deleteResponse = await app.request('/api/system/users/not-a-uuid', {
      method: 'DELETE',
    })
    const deleteBody = (await deleteResponse.json()) as ErrorResponse

    expect(deleteResponse.status).toBe(400)
    expect(deleteBody).toEqual({ message: '用户 ID 无效' })
  })

  it('returns stable validation errors for invalid user query and body input', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const queryResponse = await app.request('/api/system/users?page=0')
    const queryBody = (await queryResponse.json()) as ErrorResponse

    expect(queryResponse.status).toBe(400)
    expect(queryBody).toEqual({ message: '查询参数无效' })

    const createResponse = await app.request('/api/system/users', {
      method: 'POST',
      body: JSON.stringify({
        username: '',
        nickname: 'Missing Username',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const createBody = (await createResponse.json()) as ErrorResponse

    expect(createResponse.status).toBe(400)
    expect(createBody).toEqual({ message: '请求体无效' })

    const { body: created } = await createUser(app, {
      username: 'update-target',
      nickname: 'Update Target',
    })
    const updateResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: {
        'content-type': 'application/json',
      },
    })
    const updateBody = (await updateResponse.json()) as ErrorResponse

    expect(updateResponse.status).toBe(400)
    expect(updateBody).toEqual({ message: '请求体无效' })
  })
})
