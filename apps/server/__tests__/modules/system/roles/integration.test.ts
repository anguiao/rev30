import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import {
  BUILT_IN_ADMIN_ROLE_CODE,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
  type Role,
  type RoleListResponse,
  type RoleStatus,
} from '@rev30/shared'
import {
  systemRoleResources,
  systemRoles,
  systemResources,
  systemUserRoles,
  systemUsers,
} from '../../../../src/db/schema'
import { createProtectedSystemRouteTestApp, createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'
import { createRoleRoutes } from '../../../../src/modules/system/roles/routes'

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
        usernamePrefix: 'role-routes-admin',
      })
    ).authHeaders

  return createProtectedSystemRouteTestApp(
    database,
    '/api/system/roles',
    createRoleRoutes(database),
    headers,
  )
}

async function createResource(
  database: Awaited<ReturnType<typeof createTestDb>>,
  input: {
    name: string
    code: string
    type?: 'directory' | 'menu' | 'external' | 'action'
    parentId?: string | null
    sortOrder?: number
    deletedAt?: Date | null
  },
) {
  const now = new Date()
  const [resource] = await database
    .insert(systemResources)
    .values({
      id: randomUUID(),
      parentId: input.parentId ?? null,
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
    const app = await createTestApp(database)
    const action = await createResource(database, {
      name: 'Create User',
      code: 'test-system:user:create',
      type: RESOURCE_TYPE_ACTION,
      sortOrder: 2,
    })
    const directory = await createResource(database, {
      name: 'System',
      code: 'test-system',
      type: RESOURCE_TYPE_DIRECTORY,
      sortOrder: 1,
    })

    const { body, response } = await createRole(app, {
      name: 'Administrator',
      code: 'test-admin',
      sortOrder: 10,
      resourceIds: [action.id, directory.id],
    })

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      name: 'Administrator',
      code: 'test-admin',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 10,
    })
    expect(body.resources).toEqual([
      {
        id: directory.id,
        name: 'System',
        code: 'test-system',
        type: RESOURCE_TYPE_DIRECTORY,
      },
      {
        id: action.id,
        name: 'Create User',
        code: 'test-system:user:create',
        type: RESOURCE_TYPE_ACTION,
      },
    ])
  })

  it('lists roles with userCount only and supports keyword/status with non-deleted user counting', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: admin } = await createRole(app, {
      name: 'Administrator',
      code: 'test-admin',
      status: ROLE_STATUS_ENABLED,
    })
    await createRole(app, {
      name: 'Operator',
      code: 'operator',
      status: ROLE_STATUS_DISABLED,
    })
    const activeUserId = randomUUID()
    const deletedUserId = randomUUID()

    await database.insert(systemUsers).values([
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
    await database.insert(systemUserRoles).values([
      { userId: activeUserId, roleId: admin.id },
      { userId: deletedUserId, roleId: admin.id },
    ])

    const response = await app.request('/api/system/roles?keyword=test-admin&status=1')
    const body = (await response.json()) as RoleListResponse

    expect(response.status).toBe(200)
    expect(body.total).toBe(1)
    expect(body.list).toHaveLength(1)
    expect(body.list[0]).toMatchObject({
      id: admin.id,
      name: 'Administrator',
      code: 'test-admin',
      status: ROLE_STATUS_ENABLED,
      userCount: 1,
    })
    expect(body.list[0]).not.toHaveProperty('resources')
    expect(body.list[0]).not.toHaveProperty('resourceCount')
  })

  it('returns role details with resources', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const resource = await createResource(database, {
      name: 'System',
      code: 'test-system',
      type: RESOURCE_TYPE_DIRECTORY,
    })
    const { body: created } = await createRole(app, {
      name: 'Administrator',
      code: 'test-admin',
      resourceIds: [resource.id],
    })

    const response = await app.request(`/api/system/roles/${created.id}`)
    const body = (await response.json()) as Role

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      id: created.id,
      code: 'test-admin',
    })
    expect(body.resources).toEqual([
      {
        id: resource.id,
        name: 'System',
        code: 'test-system',
        type: RESOURCE_TYPE_DIRECTORY,
      },
    ])
  })

  it('replaces and clears role resource authorization on patch', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const system = await createResource(database, {
      name: 'System',
      code: 'test-system',
      sortOrder: 1,
    })
    const createUser = await createResource(database, {
      name: 'Create User',
      code: 'test-system:user:create',
      type: RESOURCE_TYPE_ACTION,
      parentId: system.id,
      sortOrder: 2,
    })
    const { body: created } = await createRole(app, {
      name: 'Administrator',
      code: 'test-admin',
      resourceIds: [system.id],
    })

    const replaceResponse = await app.request(`/api/system/roles/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        resourceIds: [system.id, createUser.id],
      }),
      headers: { 'content-type': 'application/json' },
    })
    const replaceBody = (await replaceResponse.json()) as Role

    expect(replaceResponse.status).toBe(200)
    expect(replaceBody.resources).toEqual([
      {
        id: system.id,
        name: 'System',
        code: 'test-system',
        type: RESOURCE_TYPE_DIRECTORY,
      },
      {
        id: createUser.id,
        name: 'Create User',
        code: 'test-system:user:create',
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
      .from(systemRoleResources)
      .where(eq(systemRoleResources.roleId, created.id))
    expect(storedRelations).toEqual([])
  })

  it('returns conflict for duplicate role code', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    await createRole(app, { name: 'Test Administrator', code: 'test-admin' })

    const duplicate = await createRole(app, { name: 'Admin Duplicate', code: 'test-admin' })
    const body = duplicate.body as unknown as ErrorResponse

    expect(duplicate.response.status).toBe(409)
    expect(body).toEqual({ field: 'code', message: '编码已存在' })
  })

  it('returns invalid resource errors for missing or deleted resources', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
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
        code: 'test-admin',
        resourceIds: [missingResourceId],
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(missingCreateResponse.status).toBe(400)
    expect(await missingCreateResponse.json()).toEqual({ message: '权限资源不存在' })

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
    expect(await deletedUpdateResponse.json()).toEqual({ message: '权限资源不存在' })
  })

  it('rejects child resource authorization without its parent resource', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const system = await createResource(database, {
      name: 'System',
      code: 'test-system',
      sortOrder: 1,
    })
    const userMenu = await createResource(database, {
      name: 'Users',
      code: 'test-system:user',
      type: RESOURCE_TYPE_DIRECTORY,
      parentId: system.id,
      sortOrder: 2,
    })
    const listUser = await createResource(database, {
      name: 'List Users',
      code: 'test-system:user:list',
      type: RESOURCE_TYPE_ACTION,
      parentId: userMenu.id,
      sortOrder: 3,
    })

    const parentOnly = await createRole(app, {
      name: 'Menu Viewer',
      code: 'menu-viewer',
      resourceIds: [system.id],
    })
    expect(parentOnly.response.status).toBe(201)
    expect(parentOnly.body.resources).toEqual([
      {
        id: system.id,
        name: 'System',
        code: 'test-system',
        type: RESOURCE_TYPE_DIRECTORY,
      },
    ])

    const missingParentResponse = await app.request('/api/system/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Action Viewer',
        code: 'action-viewer',
        resourceIds: [system.id, listUser.id],
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(missingParentResponse.status).toBe(400)
    expect(await missingParentResponse.json()).toEqual({
      field: 'resourceIds',
      message: '子级权限资源需要包含所有上级权限资源',
    })

    const fullChain = await createRole(app, {
      name: 'User Viewer',
      code: 'user-viewer',
      resourceIds: [system.id, userMenu.id, listUser.id],
    })

    expect(fullChain.response.status).toBe(201)
    expect(fullChain.body.resources.map((resource) => resource.id)).toEqual([
      system.id,
      userMenu.id,
      listUser.id,
    ])
  })

  it('rejects updating and deleting the built-in admin role', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const [adminRole] = await database
      .select()
      .from(systemRoles)
      .where(eq(systemRoles.code, BUILT_IN_ADMIN_ROLE_CODE))

    if (!adminRole) {
      throw new Error('Expected built-in admin role')
    }

    const updateResponse = await app.request(`/api/system/roles/${adminRole.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Root Administrator',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(updateResponse.status).toBe(409)
    expect(await updateResponse.json()).toEqual({ message: '内置 admin 角色不能编辑' })

    const deleteResponse = await app.request(`/api/system/roles/${adminRole.id}`, {
      method: 'DELETE',
    })

    expect(deleteResponse.status).toBe(409)
    expect(await deleteResponse.json()).toEqual({ message: '内置 admin 角色不能删除' })

    const [storedAdminRole] = await database
      .select()
      .from(systemRoles)
      .where(eq(systemRoles.id, adminRole.id))

    expect(storedAdminRole).toMatchObject({
      name: adminRole.name,
      code: BUILT_IN_ADMIN_ROLE_CODE,
      deletedAt: null,
    })
  })

  it('rejects deleting roles that are assigned to users', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: role } = await createRole(app, {
      name: 'Administrator',
      code: 'test-admin',
    })
    const userId = randomUUID()

    await database.insert(systemUsers).values({
      id: userId,
      username: 'linked-user',
      nickname: 'Linked User',
    })
    await database.insert(systemUserRoles).values({ userId, roleId: role.id })

    const response = await app.request(`/api/system/roles/${role.id}`, {
      method: 'DELETE',
    })
    const body = (await response.json()) as ErrorResponse

    expect(response.status).toBe(409)
    expect(body).toEqual({ message: '角色存在关联用户，不能删除' })
  })

  it('soft deletes roles with resources and clears role resource relations', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const resource = await createResource(database, {
      name: 'System',
      code: 'test-system',
    })
    const { body: role } = await createRole(app, {
      name: 'Administrator',
      code: 'test-admin',
      resourceIds: [resource.id],
    })

    const deleteResponse = await app.request(`/api/system/roles/${role.id}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)

    const storedRows = await database.select().from(systemRoles).where(eq(systemRoles.id, role.id))
    expect(storedRows).toHaveLength(1)
    expect(storedRows[0]?.deletedAt).toBeInstanceOf(Date)

    const storedRelations = await database
      .select()
      .from(systemRoleResources)
      .where(eq(systemRoleResources.roleId, role.id))
    expect(storedRelations).toEqual([])

    const detailResponse = await app.request(`/api/system/roles/${role.id}`)
    const detailBody = (await detailResponse.json()) as ErrorResponse
    expect(detailResponse.status).toBe(404)
    expect(detailBody).toEqual({ message: '角色不存在' })
  })
})
