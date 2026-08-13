import { randomUUID } from 'node:crypto'
import { describe, expect } from 'vitest'
import { Hono } from 'hono'
import { eq, inArray } from 'drizzle-orm'
import {
  BUILT_IN_ADMIN_ROLE_CODE,
  RESOURCE_STATUS_DISABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
  type Role,
  type RoleListResponse,
  type RoleOptionsResponse,
  type RoleStatus,
} from '@rev30/contracts'
import {
  systemRoleResources,
  systemRoles,
  systemResources,
  systemUserRoles,
  systemUsers,
} from '../../../../src/db/schema'
import { createProtectedSystemRouteTestApp, createSystemAccessFixture } from '../../../helpers/auth'
import { dbTest, type TestDatabase } from '../../../fixtures/database'
import { createSystemResourceFixture as createResource } from '../../../helpers/system'
import { createRoleRoutes } from '../../../../src/modules/system/roles/routes'

type ErrorResponse = {
  message: string
}

async function createTestApp(database: TestDatabase, authHeaders?: Record<string, string>) {
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

async function findResourceIdsByCodes(database: TestDatabase, codes: string[]) {
  const resources = await database
    .select({
      id: systemResources.id,
      code: systemResources.code,
    })
    .from(systemResources)
    .where(inArray(systemResources.code, codes))
  const idsByCode = new Map(resources.map((resource) => [resource.code, resource.id]))

  if (idsByCode.size !== codes.length) {
    throw new Error('Expected seeded resources')
  }

  return codes.map((code) => idsByCode.get(code)!)
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
  dbTest(
    'creates roles with resource ids and returns resources sorted by resource sort order',
    async ({ db: database }) => {
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
    },
  )

  dbTest('limits non-admin role management to the actor access scope', async ({ db: database }) => {
    const adminApp = await createTestApp(database)
    const actor = await createSystemAccessFixture(database, {
      accessCodes: [
        'system',
        'system:user',
        'system:user:list',
        'system:role:create',
        'system:role:update',
        'system:role:delete',
      ],
      usernamePrefix: 'limited-role-manager',
    })
    const app = await createTestApp(database, actor.authHeaders)
    const scopedResourceIds = await findResourceIdsByCodes(database, [
      'system',
      'system:user',
      'system:user:list',
    ])
    const privilegedResourceIds = await findResourceIdsByCodes(database, [
      'system',
      'system:resource',
      'system:resource:delete',
    ])
    const disabledResource = await createResource(database, {
      name: 'Disabled Resource',
      code: 'disabled-role-resource',
      status: RESOURCE_STATUS_DISABLED,
    })
    const deletedResource = await createResource(database, {
      name: 'Deleted Resource',
      code: 'deleted-role-resource',
      deletedAt: new Date(),
    })

    const scopedRole = await createRole(app, {
      name: 'Scoped Role',
      code: 'scoped-role',
      resourceIds: scopedResourceIds,
    })
    expect(scopedRole.response.status).toBe(201)

    const disabledScopedRole = await createRole(app, {
      name: 'Disabled Scoped Role',
      code: 'disabled-scoped-role',
      status: ROLE_STATUS_DISABLED,
      resourceIds: scopedResourceIds,
    })
    expect(disabledScopedRole.response.status).toBe(201)

    for (const [name, code, resourceIds] of [
      ['Privileged Role', 'privileged-role', privilegedResourceIds],
      ['Disabled Resource Role', 'disabled-resource-role', [disabledResource.id]],
    ] as const) {
      const response = await app.request('/api/system/roles', {
        method: 'POST',
        body: JSON.stringify({ name, code, resourceIds }),
        headers: { 'content-type': 'application/json' },
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({
        message: '不能管理超出自身权限范围的角色',
      })
    }

    const disabledPrivilegedResponse = await app.request('/api/system/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Disabled Privileged Role',
        code: 'disabled-privileged-role',
        status: ROLE_STATUS_DISABLED,
        resourceIds: privilegedResourceIds,
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(disabledPrivilegedResponse.status).toBe(403)

    for (const resourceIds of [
      [randomUUID()],
      [deletedResource.id],
      [scopedResourceIds[0], scopedResourceIds[0]],
    ]) {
      const response = await app.request('/api/system/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: `Invalid Role ${randomUUID()}`,
          code: `invalid-role-${randomUUID()}`,
          resourceIds,
        }),
        headers: { 'content-type': 'application/json' },
      })

      expect(response.status).toBe(400)
    }

    const privilegedUpdate = await app.request(`/api/system/roles/${scopedRole.body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ resourceIds: privilegedResourceIds }),
      headers: { 'content-type': 'application/json' },
    })
    expect(privilegedUpdate.status).toBe(403)
    expect(await privilegedUpdate.json()).toEqual({
      message: '不能管理超出自身权限范围的角色',
    })

    const adminCreated = await createRole(adminApp, {
      name: 'Admin Managed Privileged Role',
      code: 'admin-managed-privileged-role',
      resourceIds: privilegedResourceIds,
    })
    expect(adminCreated.response.status).toBe(201)

    const outOfScopeUpdate = await app.request(`/api/system/roles/${adminCreated.body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Unauthorized Rename' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(outOfScopeUpdate.status).toBe(403)

    const outOfScopeDelete = await app.request(`/api/system/roles/${adminCreated.body.id}`, {
      method: 'DELETE',
    })
    expect(outOfScopeDelete.status).toBe(403)

    const scopedDelete = await app.request(`/api/system/roles/${scopedRole.body.id}`, {
      method: 'DELETE',
    })
    expect(scopedDelete.status).toBe(204)

    const adminUpdate = await adminApp.request(`/api/system/roles/${adminCreated.body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Admin Renamed Privileged Role' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(adminUpdate.status).toBe(200)

    const adminDelete = await adminApp.request(`/api/system/roles/${adminCreated.body.id}`, {
      method: 'DELETE',
    })
    expect(adminDelete.status).toBe(204)
  })

  dbTest(
    'lists roles with userCount only and supports keyword/status with non-deleted user counting',
    async ({ db: database }) => {
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
    },
  )

  dbTest(
    'returns flat role options and supports includeIds for disabled roles only',
    async ({ db: database }) => {
      const app = await createTestApp(database)
      const enabledRoleId = randomUUID()
      const disabledRoleId = randomUUID()
      const deletedRoleId = randomUUID()

      await database.insert(systemRoles).values([
        {
          id: enabledRoleId,
          name: 'Enabled Role',
          code: 'enabled-role',
          status: ROLE_STATUS_ENABLED,
          sortOrder: 1,
          createdAt: new Date('2026-05-10T00:00:00.000Z'),
          updatedAt: new Date('2026-05-10T00:00:00.000Z'),
        },
        {
          id: disabledRoleId,
          name: 'Disabled Role',
          code: 'disabled-role',
          status: ROLE_STATUS_DISABLED,
          sortOrder: 2,
          createdAt: new Date('2026-05-09T00:00:00.000Z'),
          updatedAt: new Date('2026-05-09T00:00:00.000Z'),
        },
        {
          id: deletedRoleId,
          name: 'Deleted Role',
          code: 'deleted-role',
          status: ROLE_STATUS_ENABLED,
          sortOrder: 0,
          deletedAt: new Date('2026-05-11T00:00:00.000Z'),
          createdAt: new Date('2026-05-11T00:00:00.000Z'),
          updatedAt: new Date('2026-05-11T00:00:00.000Z'),
        },
      ])

      const optionsResponse = await app.request('/api/system/roles/options')
      const optionsBody = (await optionsResponse.json()) as RoleOptionsResponse

      expect(optionsResponse.status).toBe(200)
      expect(optionsBody).toContainEqual({
        id: enabledRoleId,
        name: 'Enabled Role',
        code: 'enabled-role',
        status: ROLE_STATUS_ENABLED,
      })
      expect(optionsBody).not.toContainEqual(
        expect.objectContaining({
          id: disabledRoleId,
        }),
      )
      expect(optionsBody).not.toContainEqual(
        expect.objectContaining({
          id: deletedRoleId,
        }),
      )
      expect(optionsBody.every((item) => item.status === ROLE_STATUS_ENABLED)).toBe(true)
      for (const item of optionsBody) {
        expect(item).not.toHaveProperty('createdAt')
        expect(item).not.toHaveProperty('updatedAt')
        expect(item).not.toHaveProperty('sortOrder')
        expect(item).not.toHaveProperty('userCount')
        expect(item).not.toHaveProperty('resources')
      }

      const includeResponse = await app.request(
        `/api/system/roles/options?includeIds=${disabledRoleId},${deletedRoleId}`,
      )
      const includeBody = (await includeResponse.json()) as RoleOptionsResponse

      expect(includeResponse.status).toBe(200)
      expect(includeBody).toContainEqual({
        id: enabledRoleId,
        name: 'Enabled Role',
        code: 'enabled-role',
        status: ROLE_STATUS_ENABLED,
      })
      expect(includeBody).toContainEqual({
        id: disabledRoleId,
        name: 'Disabled Role',
        code: 'disabled-role',
        status: ROLE_STATUS_DISABLED,
      })
      expect(includeBody).not.toContainEqual(
        expect.objectContaining({
          id: deletedRoleId,
        }),
      )
      for (const item of includeBody) {
        expect(item).not.toHaveProperty('createdAt')
        expect(item).not.toHaveProperty('updatedAt')
        expect(item).not.toHaveProperty('sortOrder')
        expect(item).not.toHaveProperty('userCount')
        expect(item).not.toHaveProperty('resources')
      }
    },
  )

  dbTest('returns role details with resources', async ({ db: database }) => {
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

  dbTest('replaces and clears role resource authorization on patch', async ({ db: database }) => {
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

  dbTest('returns conflict for duplicate role code', async ({ db: database }) => {
    const app = await createTestApp(database)
    await createRole(app, { name: 'Test Administrator', code: 'test-admin' })

    const duplicate = await createRole(app, { name: 'Admin Duplicate', code: 'test-admin' })
    const body = duplicate.body as unknown as ErrorResponse

    expect(duplicate.response.status).toBe(409)
    expect(body).toEqual({ field: 'code', message: '编码已存在' })
  })

  dbTest('allows recreating a role code after soft delete', async ({ db: database }) => {
    const app = await createTestApp(database)
    const { body: created } = await createRole(app, {
      name: 'Auditor',
      code: 'auditor-recreated',
    })

    const deleteResponse = await app.request(`/api/system/roles/${created.id}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)

    const recreated = await createRole(app, {
      name: 'Auditor Recreated',
      code: 'auditor-recreated',
    })
    expect(recreated.response.status).toBe(201)
    expect(recreated.body).toMatchObject({
      name: 'Auditor Recreated',
      code: 'auditor-recreated',
    })
  })

  dbTest(
    'returns invalid resource errors for missing or deleted resources',
    async ({ db: database }) => {
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
    },
  )

  dbTest(
    'rejects child resource authorization without its parent resource',
    async ({ db: database }) => {
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
    },
  )

  dbTest('rejects updating and deleting the built-in admin role', async ({ db: database }) => {
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

  dbTest('rejects deleting roles that are assigned to users', async ({ db: database }) => {
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

  dbTest(
    'soft deletes roles with resources and clears role resource relations',
    async ({ db: database }) => {
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

      const storedRows = await database
        .select()
        .from(systemRoles)
        .where(eq(systemRoles.id, role.id))
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
    },
  )
})
