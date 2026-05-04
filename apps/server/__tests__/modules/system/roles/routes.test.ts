import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import {
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
  type Role,
  type RoleListResponse,
  type RoleStatus,
} from '@rev30/shared'
import { roleResources, roles, systemResources, userRoles, users } from '../../../../src/db/schema'
import { createTestDb } from '../../../helpers/db'
import { createRoleRoutes } from '../../../../src/modules/system/roles/routes'

type ErrorResponse = {
  message: string
}

function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/system/roles', createRoleRoutes(database))
}

async function createResource(
  database: Awaited<ReturnType<typeof createTestDb>>,
  input: {
    name: string
    code: string
    type?: 'directory' | 'menu' | 'external' | 'action'
    sortOrder?: number
    deletedAt?: Date | null
  },
) {
  const now = new Date()
  const [resource] = await database
    .insert(systemResources)
    .values({
      id: randomUUID(),
      name: input.name,
      code: input.code,
      type: input.type ?? RESOURCE_TYPE_DIRECTORY,
      sortOrder: input.sortOrder ?? 0,
      deletedAt: input.deletedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!resource) {
    throw new Error('Expected resource')
  }

  return resource
}

async function createRole(
  app: Hono,
  body: {
    name: string
    code: string
    status?: RoleStatus
    sortOrder?: number
    resourceIds?: string[]
  },
) {
  const response = await app.request('/api/system/roles', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

  return { body: (await response.json()) as Role, response }
}

describe('role routes', () => {
  it('creates roles with resource ids and returns resources sorted by resource sort order', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const action = await createResource(database, {
      name: 'Create User',
      code: 'system:user:create',
      type: RESOURCE_TYPE_ACTION,
      sortOrder: 2,
    })
    const directory = await createResource(database, {
      name: 'System',
      code: 'system',
      type: RESOURCE_TYPE_DIRECTORY,
      sortOrder: 1,
    })

    const { body, response } = await createRole(app, {
      name: 'Administrator',
      code: 'admin',
      sortOrder: 10,
      resourceIds: [action.id, directory.id],
    })

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      name: 'Administrator',
      code: 'admin',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 10,
    })
    expect(body.resources).toEqual([
      {
        id: directory.id,
        name: 'System',
        code: 'system',
        type: RESOURCE_TYPE_DIRECTORY,
      },
      {
        id: action.id,
        name: 'Create User',
        code: 'system:user:create',
        type: RESOURCE_TYPE_ACTION,
      },
    ])
  })

  it('lists roles with userCount only and supports keyword/status with non-deleted user counting', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: admin } = await createRole(app, {
      name: 'Administrator',
      code: 'admin',
      status: ROLE_STATUS_ENABLED,
    })
    await createRole(app, {
      name: 'Operator',
      code: 'operator',
      status: ROLE_STATUS_DISABLED,
    })
    const activeUserId = randomUUID()
    const deletedUserId = randomUUID()

    await database.insert(users).values([
      {
        id: activeUserId,
        username: 'active-user',
        nickname: 'Active User',
      },
      {
        id: deletedUserId,
        username: 'deleted-user',
        nickname: 'Deleted User',
        deletedAt: new Date(),
      },
    ])
    await database.insert(userRoles).values([
      { userId: activeUserId, roleId: admin.id },
      { userId: deletedUserId, roleId: admin.id },
    ])

    const response = await app.request('/api/system/roles?keyword=adm&status=1')
    const body = (await response.json()) as RoleListResponse

    expect(response.status).toBe(200)
    expect(body.total).toBe(1)
    expect(body.list).toHaveLength(1)
    expect(body.list[0]).toMatchObject({
      id: admin.id,
      name: 'Administrator',
      code: 'admin',
      status: ROLE_STATUS_ENABLED,
      userCount: 1,
    })
    expect(body.list[0]).not.toHaveProperty('resources')
    expect(body.list[0]).not.toHaveProperty('resourceCount')
  })

  it('returns role details with resources', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const resource = await createResource(database, {
      name: 'System',
      code: 'system',
      type: RESOURCE_TYPE_DIRECTORY,
    })
    const { body: created } = await createRole(app, {
      name: 'Administrator',
      code: 'admin',
      resourceIds: [resource.id],
    })

    const response = await app.request(`/api/system/roles/${created.id}`)
    const body = (await response.json()) as Role

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      id: created.id,
      code: 'admin',
    })
    expect(body.resources).toEqual([
      {
        id: resource.id,
        name: 'System',
        code: 'system',
        type: RESOURCE_TYPE_DIRECTORY,
      },
    ])
  })

  it('replaces and clears role resource authorization on patch', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const system = await createResource(database, { name: 'System', code: 'system' })
    const createUser = await createResource(database, {
      name: 'Create User',
      code: 'system:user:create',
      type: RESOURCE_TYPE_ACTION,
    })
    const { body: created } = await createRole(app, {
      name: 'Administrator',
      code: 'admin',
      resourceIds: [system.id],
    })

    const replaceResponse = await app.request(`/api/system/roles/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        resourceIds: [createUser.id],
      }),
      headers: { 'content-type': 'application/json' },
    })
    const replaceBody = (await replaceResponse.json()) as Role

    expect(replaceResponse.status).toBe(200)
    expect(replaceBody.resources).toEqual([
      {
        id: createUser.id,
        name: 'Create User',
        code: 'system:user:create',
        type: RESOURCE_TYPE_ACTION,
      },
    ])

    const clearResponse = await app.request(`/api/system/roles/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        resourceIds: [],
      }),
      headers: { 'content-type': 'application/json' },
    })
    const clearBody = (await clearResponse.json()) as Role

    expect(clearResponse.status).toBe(200)
    expect(clearBody.resources).toEqual([])

    const storedRelations = await database
      .select()
      .from(roleResources)
      .where(eq(roleResources.roleId, created.id))
    expect(storedRelations).toEqual([])
  })

  it('returns conflict for duplicate role code', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    await createRole(app, { name: 'Administrator', code: 'admin' })

    const duplicate = await createRole(app, { name: 'Admin Duplicate', code: 'admin' })
    const body = duplicate.body as unknown as ErrorResponse

    expect(duplicate.response.status).toBe(409)
    expect(body).toEqual({ message: '角色编码已存在' })
  })

  it('returns invalid resource errors for missing or deleted resources', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const missingResourceId = randomUUID()
    const deletedResource = await createResource(database, {
      name: 'Deleted',
      code: 'system:deleted',
      deletedAt: new Date(),
    })

    const missingCreateResponse = await app.request('/api/system/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Administrator',
        code: 'admin',
        resourceIds: [missingResourceId],
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(missingCreateResponse.status).toBe(400)
    expect(await missingCreateResponse.json()).toEqual({ message: '资源不存在' })

    const { body: created } = await createRole(app, {
      name: 'Operator',
      code: 'operator',
    })
    const deletedUpdateResponse = await app.request(`/api/system/roles/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        resourceIds: [deletedResource.id],
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(deletedUpdateResponse.status).toBe(400)
    expect(await deletedUpdateResponse.json()).toEqual({ message: '资源不存在' })
  })

  it('rejects deleting roles that are assigned to users', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: role } = await createRole(app, {
      name: 'Administrator',
      code: 'admin',
    })
    const userId = randomUUID()

    await database.insert(users).values({
      id: userId,
      username: 'linked-user',
      nickname: 'Linked User',
    })
    await database.insert(userRoles).values({ userId, roleId: role.id })

    const response = await app.request(`/api/system/roles/${role.id}`, {
      method: 'DELETE',
    })
    const body = (await response.json()) as ErrorResponse

    expect(response.status).toBe(409)
    expect(body).toEqual({ message: '角色存在关联用户，不能删除' })
  })

  it('soft deletes empty roles and returns not found for subsequent detail requests', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: role } = await createRole(app, {
      name: 'Administrator',
      code: 'admin',
    })

    const deleteResponse = await app.request(`/api/system/roles/${role.id}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)

    const storedRows = await database.select().from(roles).where(eq(roles.id, role.id))
    expect(storedRows).toHaveLength(1)
    expect(storedRows[0]?.deletedAt).toBeInstanceOf(Date)

    const detailResponse = await app.request(`/api/system/roles/${role.id}`)
    const detailBody = (await detailResponse.json()) as ErrorResponse
    expect(detailResponse.status).toBe(404)
    expect(detailBody).toEqual({ message: '角色不存在' })
  })

  it('returns stable validation errors for invalid query, id params, and request bodies', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const listResponse = await app.request('/api/system/roles?page=0')
    expect(listResponse.status).toBe(400)
    expect(await listResponse.json()).toEqual({ message: '查询参数无效' })

    const detailResponse = await app.request('/api/system/roles/not-a-uuid')
    expect(detailResponse.status).toBe(400)
    expect(await detailResponse.json()).toEqual({ message: '角色 ID 无效' })

    const createResponse = await app.request('/api/system/roles', {
      method: 'POST',
      body: JSON.stringify({
        code: 'invalid',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '请求体无效' })
  })
})
