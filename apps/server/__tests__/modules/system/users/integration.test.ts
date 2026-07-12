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
  type UserCreateResponse,
  type UserListResponse,
  type UserOptionsResponse,
  type UserResetPasswordResponse,
  type UserStatus,
} from '@rev30/contracts'
import {
  attachments,
  authPasswordCredentials,
  authRefreshTokens,
  systemDepartments,
  systemRoles,
  systemUserDepartments,
  systemUserRoles,
  systemUsers,
} from '../../../../src/db/schema'
import { hashPassword, verifyPassword } from '../../../../src/modules/auth/password'
import { createProtectedSystemRouteTestApp, createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'
import { createUserRoutes } from '../../../../src/modules/system/users/routes'
import { expectJsonResponse, jsonRequest, responseJson } from '../../../helpers/http'

type ErrorResponse = {
  message: string
  field?: string
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

async function createUserCreateAccessApp() {
  const database = await createTestDb()
  const fixture = await createSystemAccessFixture(database, {
    accessCodes: ['system:user:create'],
  })
  const app = createProtectedSystemRouteTestApp(
    database,
    '/api/system/users',
    createUserRoutes(database),
    fixture.authHeaders,
  )

  return app
}

async function createUser(
  app: Hono,
  body: {
    username: string
    nickname: string
    avatarId?: string | null
    email?: string | null
    phone?: string | null
    status?: UserStatus
    departmentIds?: string[]
    roleIds?: string[]
  },
) {
  const response = await app.request('/api/system/users', jsonRequest(body, { method: 'POST' }))

  const responseBody = await responseJson<UserCreateResponse>(response)

  return {
    body: responseBody.user,
    response,
    temporaryPassword: responseBody.temporaryPassword,
  }
}

async function createDepartment(
  database: Awaited<ReturnType<typeof createTestDb>>,
  input: { name: string; code: string; sortOrder?: number; deletedAt?: Date | null },
) {
  const now = new Date()
  const [department] = await database
    .insert(systemDepartments)
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
    .insert(systemRoles)
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

async function createAvatarAttachment(
  database: Awaited<ReturnType<typeof createTestDb>>,
  createdBy: string,
) {
  const id = randomUUID()
  const now = new Date('2026-05-30T00:00:00.000Z')
  const [attachment] = await database
    .insert(attachments)
    .values({
      id,
      storageProvider: 'local',
      storageKey: `2026/05/30/${id}.png`,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 128,
      usage: 'avatar',
      createdBy,
      createdAt: now,
    })
    .returning()

  if (!attachment) {
    throw new Error('Expected avatar attachment')
  }

  return attachment
}

describe('user routes', () => {
  it('creates users with a generated temporary password credential', async () => {
    const database = await createTestDb()
    const fixture = await createSystemAccessFixture(database, {
      accessCodes: ['system:user:create'],
    })
    const app = createProtectedSystemRouteTestApp(
      database,
      '/api/system/users',
      createUserRoutes(database),
      fixture.authHeaders,
    )

    const response = await app.request(
      '/api/system/users',
      jsonRequest(
        {
          username: 'created-by-admin',
          nickname: 'Created By Admin',
          email: null,
          phone: null,
          status: USER_STATUS_ENABLED,
          departmentIds: [],
          roleIds: [],
        },
        {
          method: 'POST',
        },
      ),
    )
    const body = await responseJson<UserCreateResponse>(response)

    expect(response.status).toBe(201)
    expect(body.user.username).toBe('created-by-admin')
    expect(body.temporaryPassword).toEqual(expect.any(String))
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(8)

    const credential = await database.query.authPasswordCredentials.findFirst({
      where: { userId: body.user.id },
    })
    expect(credential?.mustChangePassword).toBe(true)
    expect(await verifyPassword(body.temporaryPassword, credential!.passwordHash)).toBe(true)
  })

  it('returns a field error when a department relation does not exist', async () => {
    const app = await createUserCreateAccessApp()

    const response = await app.request(
      '/api/system/users',
      jsonRequest(
        {
          username: 'invalid-department-user',
          nickname: 'Invalid Department User',
          email: null,
          phone: null,
          status: USER_STATUS_ENABLED,
          departmentIds: ['11111111-1111-4111-8111-111111111111'],
          roleIds: [],
        },
        {
          method: 'POST',
        },
      ),
    )
    await expectJsonResponse(response, {
      status: 400,
      body: {
        field: 'departmentIds',
        message: '部门不存在',
      },
    })
  })

  it('returns a field error when a role relation does not exist', async () => {
    const app = await createUserCreateAccessApp()

    const response = await app.request(
      '/api/system/users',
      jsonRequest(
        {
          username: 'invalid-role-user',
          nickname: 'Invalid Role User',
          email: null,
          phone: null,
          status: USER_STATUS_ENABLED,
          departmentIds: [],
          roleIds: ['22222222-2222-4222-8222-222222222222'],
        },
        {
          method: 'POST',
        },
      ),
    )
    await expectJsonResponse(response, {
      status: 400,
      body: {
        field: 'roleIds',
        message: '角色不存在',
      },
    })
  })

  it('returns bad request when avatar ids do not exist', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request(
      '/api/system/users',
      jsonRequest(
        {
          username: 'invalid-avatar-user',
          nickname: 'Invalid Avatar User',
          avatarId: '11111111-1111-4111-8111-111111111111',
        },
        { method: 'POST' },
      ),
    )

    await expectJsonResponse(response, {
      status: 400,
      body: {
        message: '请求体无效',
      },
    })
  })

  it('resets non-built-in user passwords and revokes refresh sessions', async () => {
    const database = await createTestDb()
    const fixture = await createSystemAccessFixture(database, {
      accessCodes: ['system:user:reset-password'],
    })
    const app = createProtectedSystemRouteTestApp(
      database,
      '/api/system/users',
      createUserRoutes(database),
      fixture.authHeaders,
    )
    const userId = '33333333-3333-4333-8333-333333333333'
    await database.insert(systemUsers).values({
      id: userId,
      username: 'reset-password-user',
      nickname: 'Reset Password User',
      status: USER_STATUS_ENABLED,
      createdAt: new Date('2026-05-08T00:00:00.000Z'),
      updatedAt: new Date('2026-05-08T00:00:00.000Z'),
    })
    await database.insert(authPasswordCredentials).values({
      userId,
      passwordHash: await hashPassword('old-password'),
      mustChangePassword: false,
      createdAt: new Date('2026-05-08T00:00:00.000Z'),
      updatedAt: new Date('2026-05-08T00:00:00.000Z'),
    })
    await database.insert(authRefreshTokens).values({
      id: '44444444-4444-4444-8444-444444444444',
      userId,
      tokenHash: 'reset-password-token-hash',
      expiresAt: new Date('2026-06-08T00:00:00.000Z'),
      createdAt: new Date('2026-05-08T00:00:00.000Z'),
      updatedAt: new Date('2026-05-08T00:00:00.000Z'),
    })

    const response = await app.request(`/api/system/users/${userId}/password/reset`, {
      method: 'POST',
    })
    const body = (await response.json()) as UserResetPasswordResponse

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ userId })
    expect(body.temporaryPassword).toEqual(expect.any(String))

    const credential = await database.query.authPasswordCredentials.findFirst({
      where: { userId },
    })
    expect(credential?.mustChangePassword).toBe(true)
    expect(await verifyPassword(body.temporaryPassword, credential!.passwordHash)).toBe(true)

    const sessions = await database.query.authRefreshTokens.findMany({
      where: { userId },
    })
    expect(sessions[0]?.revokedAt).toBeInstanceOf(Date)
  })

  it('creates users in the database and returns paginated users', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const { body, response, temporaryPassword } = await createUser(app, {
      username: 'ada-lovelace-created',
      nickname: 'Ada Lovelace Created',
      email: 'ada-lovelace-created@example.com',
      phone: '10000000001',
    })

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      username: 'ada-lovelace-created',
      nickname: 'Ada Lovelace Created',
      email: 'ada-lovelace-created@example.com',
      phone: '10000000001',
      status: USER_STATUS_ENABLED,
      departments: [],
      roles: [],
    })
    expect(body.createdAt).toEqual(expect.any(String))
    expect(body.updatedAt).toEqual(expect.any(String))
    expect(temporaryPassword).toEqual(expect.any(String))

    const storedUsers = await database
      .select()
      .from(systemUsers)
      .where(eq(systemUsers.username, 'ada-lovelace-created'))
    expect(storedUsers).toHaveLength(1)
    expect(storedUsers[0]?.username).toBe('ada-lovelace-created')

    const listResponse = await app.request(
      '/api/system/users?keyword=ada-lovelace-created&page=1&pageSize=10',
    )
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
      username: 'ada-lovelace-created',
      departments: [],
      roles: [],
    })
  })

  it('creates, lists, details, and updates users with avatar ids', async () => {
    const database = await createTestDb()
    const fixture = await createSystemAccessFixture(database, {
      admin: true,
      usernamePrefix: 'avatar-admin',
    })
    const app = await createTestApp(database, fixture.authHeaders)
    const avatar = await createAvatarAttachment(database, fixture.userId)

    const { body: created } = await createUser(app, {
      username: 'avatar-user',
      nickname: 'Avatar User',
      avatarId: avatar.id,
    })

    expect(created.avatarId).toBe(avatar.id)

    const detailResponse = await app.request(`/api/system/users/${created.id}`)
    const detailBody = (await detailResponse.json()) as User
    expect(detailBody.avatarId).toBe(avatar.id)

    const listResponse = await app.request('/api/system/users?keyword=avatar-user')
    const listBody = (await listResponse.json()) as UserListResponse
    expect(listBody.list[0]?.avatarId).toBe(avatar.id)

    await database
      .update(attachments)
      .set({ deletedAt: new Date('2026-05-31T00:00:00.000Z') })
      .where(eq(attachments.id, avatar.id))

    const softDeletedAvatarDetailResponse = await app.request(`/api/system/users/${created.id}`)
    const softDeletedAvatarDetailBody = (await softDeletedAvatarDetailResponse.json()) as User
    expect(softDeletedAvatarDetailBody.avatarId).toBe(avatar.id)

    const updateResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ avatarId: null }),
      headers: { 'content-type': 'application/json' },
    })
    const updateBody = (await updateResponse.json()) as User

    expect(updateResponse.status).toBe(200)
    expect(updateBody.avatarId).toBeNull()
  })

  it('filters paginated users by department and role assignments', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const engineering = await createDepartment(database, {
      name: 'Engineering',
      code: 'engineering-filter',
    })
    const product = await createDepartment(database, {
      name: 'Product',
      code: 'product-filter',
    })
    const admin = await createRole(database, {
      name: 'Admin',
      code: 'admin-filter',
    })
    const auditor = await createRole(database, {
      name: 'Auditor',
      code: 'auditor-filter',
    })

    await createUser(app, {
      username: 'engineering-admin-user',
      nickname: 'Engineering Admin User',
      departmentIds: [engineering.id],
      roleIds: [admin.id],
    })
    await createUser(app, {
      username: 'engineering-auditor-user',
      nickname: 'Engineering Auditor User',
      departmentIds: [engineering.id],
      roleIds: [auditor.id],
    })
    await createUser(app, {
      username: 'product-admin-user',
      nickname: 'Product Admin User',
      departmentIds: [product.id],
      roleIds: [admin.id],
    })

    const departmentResponse = await app.request(
      `/api/system/users?departmentId=${engineering.id}&page=1&pageSize=10`,
    )
    const departmentBody = (await departmentResponse.json()) as UserListResponse

    expect(departmentResponse.status).toBe(200)
    expect(departmentBody.total).toBe(2)
    expect(new Set(departmentBody.list.map((user) => user.username))).toEqual(
      new Set(['engineering-admin-user', 'engineering-auditor-user']),
    )

    const roleResponse = await app.request(`/api/system/users?roleId=${admin.id}`)
    const roleBody = (await roleResponse.json()) as UserListResponse

    expect(roleResponse.status).toBe(200)
    expect(roleBody.total).toBe(2)
    expect(new Set(roleBody.list.map((user) => user.username))).toEqual(
      new Set(['engineering-admin-user', 'product-admin-user']),
    )

    const combinedResponse = await app.request(
      `/api/system/users?departmentId=${engineering.id}&roleId=${admin.id}`,
    )
    const combinedBody = (await combinedResponse.json()) as UserListResponse

    expect(combinedResponse.status).toBe(200)
    expect(combinedBody.total).toBe(1)
    expect(combinedBody.list[0]?.username).toBe('engineering-admin-user')
  })

  it('returns flat user options and supports includeIds for disabled users only', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const now = new Date('2026-05-10T00:00:00.000Z')
    const enabledUserId = randomUUID()
    const disabledUserId = randomUUID()
    const deletedUserId = randomUUID()

    await database.insert(systemUsers).values([
      {
        id: enabledUserId,
        username: 'enabled-user',
        nickname: 'Enabled User',
        status: USER_STATUS_ENABLED,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: disabledUserId,
        username: 'disabled-user',
        nickname: 'Disabled User',
        status: USER_STATUS_DISABLED,
        createdAt: new Date('2026-05-09T00:00:00.000Z'),
        updatedAt: new Date('2026-05-09T00:00:00.000Z'),
      },
      {
        id: deletedUserId,
        username: 'deleted-user',
        nickname: 'Deleted User',
        status: USER_STATUS_ENABLED,
        deletedAt: new Date('2026-05-11T00:00:00.000Z'),
        createdAt: new Date('2026-05-11T00:00:00.000Z'),
        updatedAt: new Date('2026-05-11T00:00:00.000Z'),
      },
    ])

    const optionsResponse = await app.request('/api/system/users/options')
    const optionsBody = (await optionsResponse.json()) as UserOptionsResponse

    expect(optionsResponse.status).toBe(200)
    expect(optionsBody).toContainEqual({
      id: enabledUserId,
      username: 'enabled-user',
      nickname: 'Enabled User',
      status: USER_STATUS_ENABLED,
    })
    expect(optionsBody).not.toContainEqual(
      expect.objectContaining({
        id: disabledUserId,
      }),
    )
    expect(optionsBody).not.toContainEqual(
      expect.objectContaining({
        id: deletedUserId,
      }),
    )
    expect(optionsBody.every((item) => item.status === USER_STATUS_ENABLED)).toBe(true)
    for (const item of optionsBody) {
      expect(item).not.toHaveProperty('createdAt')
      expect(item).not.toHaveProperty('updatedAt')
      expect(item).not.toHaveProperty('departments')
      expect(item).not.toHaveProperty('roles')
    }

    const includeResponse = await app.request(
      `/api/system/users/options?includeIds=${disabledUserId},${deletedUserId}`,
    )
    const includeBody = (await includeResponse.json()) as UserOptionsResponse

    expect(includeResponse.status).toBe(200)
    expect(includeBody).toContainEqual({
      id: enabledUserId,
      username: 'enabled-user',
      nickname: 'Enabled User',
      status: USER_STATUS_ENABLED,
    })
    expect(includeBody).toContainEqual({
      id: disabledUserId,
      username: 'disabled-user',
      nickname: 'Disabled User',
      status: USER_STATUS_DISABLED,
    })
    expect(includeBody).not.toContainEqual(
      expect.objectContaining({
        id: deletedUserId,
      }),
    )
    for (const item of includeBody) {
      expect(item).not.toHaveProperty('createdAt')
      expect(item).not.toHaveProperty('updatedAt')
      expect(item).not.toHaveProperty('departments')
      expect(item).not.toHaveProperty('roles')
    }
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

    const storedRelations = await database.select().from(systemUserDepartments)
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
      .from(systemUserRoles)
      .where(eq(systemUserRoles.userId, body.id))
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
      expect(createBody).toEqual({ field: 'roleIds', message: '角色不存在' })
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
      expect(updateBody).toEqual({ field: 'roleIds', message: '角色不存在' })
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
      expect(createBody).toEqual({ field: 'departmentIds', message: '部门不存在' })
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
      expect(updateBody).toEqual({ field: 'departmentIds', message: '部门不存在' })
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
      .insert(systemUsers)
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

    const [storedUser] = await database
      .select()
      .from(systemUsers)
      .where(eq(systemUsers.id, builtInUser.id))
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

    const storedRows = await database
      .select()
      .from(systemUsers)
      .where(eq(systemUsers.id, created.id))
    expect(storedRows).toHaveLength(1)

    const storedUser = storedRows[0]
    if (!storedUser) {
      throw new Error('Expected stored user')
    }

    expect(storedUser.deletedAt).toBeInstanceOf(Date)
    expect(storedUser.status).toBe(USER_STATUS_ENABLED)

    const storedRelations = await database
      .select()
      .from(systemUserDepartments)
      .where(eq(systemUserDepartments.userId, created.id))
    expect(storedRelations).toEqual([])

    const storedRoleRelations = await database
      .select()
      .from(systemUserRoles)
      .where(eq(systemUserRoles.userId, created.id))
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

  it('allows reusing username, email, and phone after soft delete', async () => {
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

    const afterDeleteRecreated = await createUser(app, {
      username: 'margaret',
      nickname: 'Margaret Recreated',
      email: 'margaret@example.com',
      phone: '10000000004',
    })

    expect(afterDeleteRecreated.response.status).toBe(201)
    expect(afterDeleteRecreated.body).toMatchObject({
      username: 'margaret',
      nickname: 'Margaret Recreated',
      email: 'margaret@example.com',
      phone: '10000000004',
    })
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
    const statuses = responses
      .map((response) => response.status)
      .sort((left, right) => left - right)

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
    const statuses = responses
      .map((response) => response.status)
      .sort((left, right) => left - right)

    expect(statuses).toEqual([200, 409])
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
})
