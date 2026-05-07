import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  ROLE_STATUS_ENABLED,
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  type RoleStatus,
  type User,
  type UserListResponse,
  type UserStatus,
} from '@rev30/shared'
import { departments, roles, userDepartments, userRoles, users } from '../../../../src/db/schema'
import { createProtectedSystemRouteTestApp, createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'
import { createUserRoutes } from '../../../../src/modules/system/users/routes'

type ErrorResponse = {
  message: string
}

async function createTestApp(
  database: Awaited<ReturnType<typeof createTestDb>>,
  authHeaders?: Record<string, string>,
) {
  const headers =
    authHeaders ??
    (
      await createSystemAccessFixture(database, {
        admin: true,
        usernamePrefix: 'user-routes-admin',
      })
    ).authHeaders

  return createProtectedSystemRouteTestApp(
    database,
    '/api/system/users',
    createUserRoutes(database),
    headers,
  )
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
    roleIds?: string[]
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
  input: { name: string; code: string; sortOrder?: number; deletedAt?: Date | null },
) {
  const now = new Date()
  const [department] = await database
    .insert(departments)
    .values({
      id: randomUUID(),
      name: input.name,
      code: input.code,
      sortOrder: input.sortOrder ?? 0,
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

async function createRole(
  database: Awaited<ReturnType<typeof createTestDb>>,
  input: {
    name: string
    code: string
    status?: RoleStatus
    sortOrder?: number
    deletedAt?: Date | null
  },
) {
  const now = new Date()
  const [role] = await database
    .insert(roles)
    .values({
      id: randomUUID(),
      name: input.name,
      code: input.code,
      status: input.status ?? ROLE_STATUS_ENABLED,
      sortOrder: input.sortOrder ?? 0,
      deletedAt: input.deletedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!role) {
    throw new Error('Expected role')
  }

  return role
}

describe('user routes', () => {
  it('creates users in the database and returns paginated users', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

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
      roles: [],
    })
    expect(body.createdAt).toEqual(expect.any(String))
    expect(body.updatedAt).toEqual(expect.any(String))

    const storedUsers = await database.select().from(users).where(eq(users.username, 'ada'))
    expect(storedUsers).toHaveLength(1)
    expect(storedUsers[0]?.username).toBe('ada')

    const listResponse = await app.request('/api/system/users?keyword=ada&page=1&pageSize=10')
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
      roles: [],
    })
  })

  it('returns details and updates disabled users without treating them as deleted', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

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
      roles: [],
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
      roles: [],
    })
  })

  it('creates users with multiple departments and returns department summaries', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const engineering = await createDepartment(database, {
      name: 'Engineering',
      code: 'engineering',
      sortOrder: 20,
    })
    const product = await createDepartment(database, {
      name: 'Product',
      code: 'product',
      sortOrder: 10,
    })

    const { body, response } = await createUser(app, {
      username: 'department-user',
      nickname: 'Department User',
      departmentIds: [engineering.id, product.id],
    })

    expect(response.status).toBe(201)
    expect(body.departments).toEqual([
      {
        id: product.id,
        name: 'Product',
        code: 'product',
      },
      {
        id: engineering.id,
        name: 'Engineering',
        code: 'engineering',
      },
    ])

    const detailResponse = await app.request(`/api/system/users/${body.id}`)
    const detailBody = (await detailResponse.json()) as User
    expect(detailResponse.status).toBe(200)
    expect(detailBody.departments).toEqual(body.departments)

    const listResponse = await app.request(
      '/api/system/users?keyword=department-user&page=1&pageSize=10',
    )
    const listBody = (await listResponse.json()) as UserListResponse
    expect(listResponse.status).toBe(200)
    expect(listBody.list).toHaveLength(1)
    expect(listBody.list[0]?.departments).toEqual(body.departments)

    const storedRelations = await database.select().from(userDepartments)
    expect(storedRelations).toHaveLength(2)
    expect(new Set(storedRelations.map((relation) => relation.createdAt.getTime()))).toHaveLength(1)
  })

  it('replaces and clears user departments on update', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
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
    expect(clearBody.roles).toEqual([])
  })

  it('creates users with multiple roles and returns role summaries', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const admin = await createRole(database, {
      name: 'Administrator',
      code: 'test-admin',
      sortOrder: 20,
    })
    const editor = await createRole(database, {
      name: 'Editor',
      code: 'editor',
      sortOrder: 10,
    })

    const { body, response } = await createUser(app, {
      username: 'role-user',
      nickname: 'Role User',
      roleIds: [admin.id, editor.id],
    })

    expect(response.status).toBe(201)
    expect(body.roles).toEqual([
      {
        id: editor.id,
        name: 'Editor',
        code: 'editor',
      },
      {
        id: admin.id,
        name: 'Administrator',
        code: 'test-admin',
      },
    ])
    expect(body.departments).toEqual([])

    const detailResponse = await app.request(`/api/system/users/${body.id}`)
    const detailBody = (await detailResponse.json()) as User
    expect(detailResponse.status).toBe(200)
    expect(detailBody.roles).toEqual(body.roles)
    expect(detailBody.departments).toEqual([])

    const listResponse = await app.request('/api/system/users?keyword=role-user&page=1&pageSize=10')
    const listBody = (await listResponse.json()) as UserListResponse
    expect(listResponse.status).toBe(200)
    expect(listBody.list).toHaveLength(1)
    expect(listBody.list[0]?.roles).toEqual(body.roles)
    expect(listBody.list[0]?.departments).toEqual([])

    const storedRelations = await database
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, body.id))
    expect(storedRelations).toHaveLength(2)
    expect(new Set(storedRelations.map((relation) => relation.createdAt.getTime()))).toHaveLength(1)
  })

  it('replaces and clears user roles on update', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const admin = await createRole(database, {
      name: 'Administrator',
      code: 'test-admin',
    })
    const editor = await createRole(database, {
      name: 'Editor',
      code: 'editor',
    })

    const { body: created } = await createUser(app, {
      username: 'role-update-user',
      nickname: 'Role Update User',
      roleIds: [admin.id],
    })

    const replaceResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        roleIds: [editor.id],
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const replaceBody = (await replaceResponse.json()) as User

    expect(replaceResponse.status).toBe(200)
    expect(replaceBody.roles).toEqual([
      {
        id: editor.id,
        name: 'Editor',
        code: 'editor',
      },
    ])

    const updateNicknameResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Role Update User v2',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const updateNicknameBody = (await updateNicknameResponse.json()) as User

    expect(updateNicknameResponse.status).toBe(200)
    expect(updateNicknameBody.roles).toEqual([
      {
        id: editor.id,
        name: 'Editor',
        code: 'editor',
      },
    ])

    const clearResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        roleIds: [],
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const clearBody = (await clearResponse.json()) as User

    expect(clearResponse.status).toBe(200)
    expect(clearBody.roles).toEqual([])
    expect(clearBody.departments).toEqual([])
  })

  it('rejects missing or deleted role ids on user create and update', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const deletedRole = await createRole(database, {
      name: 'Deleted Role',
      code: 'deleted-role',
      deletedAt: new Date(),
    })
    const missingRoleId = randomUUID()
    const invalidRoleIds = [deletedRole.id, missingRoleId]

    for (const [index, roleId] of invalidRoleIds.entries()) {
      const createResponse = await app.request('/api/system/users', {
        method: 'POST',
        body: JSON.stringify({
          username: `invalid-role-create-user-${index}`,
          nickname: `Invalid Role Create User ${index}`,
          roleIds: [roleId],
        }),
        headers: {
          'content-type': 'application/json',
        },
      })
      const createBody = (await createResponse.json()) as ErrorResponse

      expect(createResponse.status).toBe(400)
      expect(createBody).toEqual({ message: '角色不存在' })
    }

    const { body: validUser } = await createUser(app, {
      username: 'valid-for-invalid-role-update',
      nickname: 'Valid For Invalid Role Update',
    })

    for (const roleId of invalidRoleIds) {
      const updateResponse = await app.request(`/api/system/users/${validUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          roleIds: [roleId],
        }),
        headers: {
          'content-type': 'application/json',
        },
      })
      const updateBody = (await updateResponse.json()) as ErrorResponse

      expect(updateResponse.status).toBe(400)
      expect(updateBody).toEqual({ message: '角色不存在' })
    }
  })

  it('rejects missing or deleted department ids on user create and update', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
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
    const app = await createTestApp(database)
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

  it('rejects updating and deleting built-in users', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const [builtInUser] = await database
      .insert(users)
      .values({
        id: randomUUID(),
        username: 'built-in-admin',
        nickname: 'Built-in Admin',
        builtIn: true,
      })
      .returning()

    if (!builtInUser) {
      throw new Error('Expected built-in user')
    }

    const updateResponse = await app.request(`/api/system/users/${builtInUser.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Edited Built-in Admin',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(updateResponse.status).toBe(409)
    expect(await updateResponse.json()).toEqual({ message: '内置用户不能编辑' })

    const deleteResponse = await app.request(`/api/system/users/${builtInUser.id}`, {
      method: 'DELETE',
    })

    expect(deleteResponse.status).toBe(409)
    expect(await deleteResponse.json()).toEqual({ message: '内置用户不能删除' })

    const [storedUser] = await database.select().from(users).where(eq(users.id, builtInUser.id))
    expect(storedUser).toMatchObject({
      nickname: 'Built-in Admin',
      builtIn: true,
      deletedAt: null,
    })
  })

  it('soft deletes users without removing database rows', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
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
      roleIds: [
        (
          await createRole(database, {
            name: 'Research Role',
            code: 'research-role',
          })
        ).id,
      ],
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

    const storedRoleRelations = await database
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, created.id))
    expect(storedRoleRelations).toEqual([])

    const listResponse = await app.request('/api/system/users?keyword=alan')
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
    const app = await createTestApp(database)

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
    const app = await createTestApp(database)
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
    const app = await createTestApp(database)

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

    for (const [body, field, message] of [
      [{ username: 'katherine' }, 'username', '用户名已存在'],
      [{ email: 'katherine@example.com' }, 'email', '邮箱已存在'],
      [{ phone: '10000000005' }, 'phone', '手机号已存在'],
    ] as const) {
      const response = await app.request(`/api/system/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: {
          'content-type': 'application/json',
        },
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ field, message })
    }
  })

  it('returns conflict when concurrent updates hit the username unique index', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
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
    const app = await createTestApp(database)

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
    const app = await createTestApp(database)

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

  it('returns 401 when requesting user routes without authentication', async () => {
    const database = await createTestDb()
    const app = createProtectedSystemRouteTestApp(
      database,
      '/api/system/users',
      createUserRoutes(database),
    )

    const response = await app.request('/api/system/users')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
  })

  it('returns 403 when the user lacks user list access', async () => {
    const database = await createTestDb()
    const denied = await createSystemAccessFixture(database, {
      accessCodes: ['system:department:list'],
      usernamePrefix: 'user-routes-forbidden',
    })
    const app = await createTestApp(database, denied.authHeaders)

    const response = await app.request('/api/system/users')

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ message: '无权访问' })
  })

  it('allows non-admin users with system:user:list access to list users', async () => {
    const database = await createTestDb()
    const adminApp = await createTestApp(database)
    const authorized = await createSystemAccessFixture(database, {
      accessCodes: ['system:user:list'],
      usernamePrefix: 'user-routes-reader',
    })
    const app = await createTestApp(database, authorized.authHeaders)

    const { body: created } = await createUser(adminApp, {
      username: 'authorized-visible-user',
      nickname: 'Authorized Visible User',
    })
    const response = await app.request('/api/system/users')
    const body = (await response.json()) as UserListResponse

    expect(response.status).toBe(200)
    expect(body.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          username: 'authorized-visible-user',
        }),
      ]),
    )
  })

  it('allows admin users to access protected user routes without explicit role resources', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request('/api/system/users')

    expect(response.status).toBe(200)
  })
})
