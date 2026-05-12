import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import {
  RESOURCE_OPEN_TARGET_BLANK,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  type Resource,
  type ResourceListResponse,
  type ResourceTreeNode,
} from '@rev30/shared'
import { roleResources, roles, systemResources } from '../../../../src/db/schema'
import { createProtectedSystemRouteTestApp, createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'
import { createResourceRoutes } from '../../../../src/modules/system/resources/routes'

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
        usernamePrefix: 'resource-routes-admin',
      })
    ).authHeaders

  return createProtectedSystemRouteTestApp(
    database,
    '/api/system/resources',
    createResourceRoutes(database),
    headers,
  )
}

async function createResource(
  app: Hono,
  body: {
    type: 'directory' | 'menu' | 'external' | 'action'
    name: string
    code: string
    parentId?: string | null
    path?: string | null
    externalUrl?: string | null
    openTarget?: 'self' | 'blank'
    icon?: string | null
    hidden?: boolean
    status?: 0 | 1
    sortOrder?: number
  },
) {
  const response = await app.request('/api/system/resources', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

  return { body: (await response.json()) as Resource, response }
}

describe('resource routes', () => {
  it('creates resources in the database and returns paginated resources', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const { body, response } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'test-system',
      icon: 'lucide:settings',
      sortOrder: 10,
    })

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      parentId: null,
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'test-system',
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: 'lucide:settings',
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 10,
    })
    expect(body.createdAt).toEqual(expect.any(String))
    expect(body.updatedAt).toEqual(expect.any(String))

    const storedResources = await database.select().from(systemResources)
    expect(storedResources.some((resource) => resource.code === 'test-system')).toBe(true)

    const listResponse = await app.request('/api/system/resources?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as ResourceListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody.page).toBe(1)
    expect(listBody.pageSize).toBe(10)
    expect(listBody.total).toBeGreaterThanOrEqual(1)
    expect(listBody.list).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: body.id, code: 'test-system' })]),
    )
  })

  it('creates typed menus, external links, and action permission points', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'test-system',
    })

    const { body: menu } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'test-system:user',
      parentId: root.id,
      path: '/system/users',
      hidden: true,
    })
    const { body: external } = await createResource(app, {
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'Docs',
      code: 'test-system:docs',
      externalUrl: 'https://example.com/docs',
    })
    const { body: action } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Export Users',
      code: 'test-system:user:export',
    })

    expect(menu).toMatchObject({
      parentId: root.id,
      path: '/system/users',
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      hidden: true,
    })
    expect(external).toMatchObject({
      path: null,
      externalUrl: 'https://example.com/docs',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
    })
    expect(action).toMatchObject({
      parentId: null,
      path: null,
      externalUrl: null,
    })
  })

  it('returns field errors when creating resources with invalid type-specific fields', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const missingPathResponse = await app.request('/api/system/resources', {
      method: 'POST',
      body: JSON.stringify({
        type: RESOURCE_TYPE_MENU,
        name: 'Users',
        code: 'test-system:user',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(missingPathResponse.status).toBe(400)
    expect((await missingPathResponse.json()) as ErrorResponse).toEqual({
      field: 'path',
      message: '内部菜单路径不能为空',
    })

    const invalidExternalUrlResponse = await app.request('/api/system/resources', {
      method: 'POST',
      body: JSON.stringify({
        type: RESOURCE_TYPE_EXTERNAL,
        name: 'Docs',
        code: 'test-system:docs',
        externalUrl: 'not-a-url',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(invalidExternalUrlResponse.status).toBe(400)
    expect((await invalidExternalUrlResponse.json()) as ErrorResponse).toEqual({
      field: 'externalUrl',
      message: '外链地址无效',
    })
  })

  it('filters resource lists by keyword, type, status, and parent id', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'test-system',
    })
    const { body: users } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'test-system:user',
      parentId: root.id,
      path: '/system/users',
      status: RESOURCE_STATUS_DISABLED,
    })
    await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Departments',
      code: 'test-system:department',
      parentId: root.id,
      path: '/system/departments',
      status: RESOURCE_STATUS_ENABLED,
    })

    const listResponse = await app.request(
      `/api/system/resources?keyword=user&type=menu&status=0&parentId=${root.id}`,
    )
    const listBody = (await listResponse.json()) as ResourceListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody.total).toBe(1)
    expect(listBody.list).toHaveLength(1)
    expect(listBody.list[0]).toMatchObject({
      id: users.id,
      code: 'test-system:user',
      type: RESOURCE_TYPE_MENU,
      status: RESOURCE_STATUS_DISABLED,
    })
  })

  it('returns resource details and resource trees', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'test-system',
      sortOrder: 1,
    })
    const { body: child } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Create User',
      code: 'test-system:user:create',
      parentId: root.id,
      sortOrder: 2,
    })

    const detailResponse = await app.request(`/api/system/resources/${child.id}`)
    const detailBody = (await detailResponse.json()) as Resource

    expect(detailResponse.status).toBe(200)
    expect(detailBody).toMatchObject({
      id: child.id,
      parentId: root.id,
      code: 'test-system:user:create',
    })

    const treeResponse = await app.request('/api/system/resources/tree')
    const treeBody = (await treeResponse.json()) as ResourceTreeNode[]

    expect(treeResponse.status).toBe(200)
    const treeRoot = treeBody.find((resource) => resource.id === root.id)
    expect(treeRoot).toMatchObject({
      id: root.id,
      code: 'test-system',
    })
    expect(treeRoot?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: child.id,
          parentId: root.id,
          code: 'test-system:user:create',
          children: [],
        }),
      ]),
    )
  })

  it('updates resource fields, normalizes type-specific fields, and rejects circular moves', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'test-system',
    })
    const { body: child } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'test-system:user',
      parentId: root.id,
      path: '/system/users',
    })

    const updateResponse = await app.request(`/api/system/resources/${child.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: RESOURCE_TYPE_EXTERNAL,
        name: 'User Docs',
        code: 'test-system:user-docs',
        externalUrl: 'https://example.com/users',
        openTarget: RESOURCE_OPEN_TARGET_BLANK,
        sortOrder: 20,
      }),
      headers: { 'content-type': 'application/json' },
    })
    const updateBody = (await updateResponse.json()) as Resource

    expect(updateResponse.status).toBe(200)
    expect(updateBody).toMatchObject({
      id: child.id,
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'User Docs',
      code: 'test-system:user-docs',
      path: null,
      externalUrl: 'https://example.com/users',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
      sortOrder: 20,
    })

    const selfMoveResponse = await app.request(`/api/system/resources/${child.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: child.id }),
      headers: { 'content-type': 'application/json' },
    })
    expect(selfMoveResponse.status).toBe(409)
    expect(await selfMoveResponse.json()).toEqual({ message: '不能移动到自己或子级权限资源下' })

    const descendantMoveResponse = await app.request(`/api/system/resources/${root.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: child.id }),
      headers: { 'content-type': 'application/json' },
    })
    expect(descendantMoveResponse.status).toBe(409)
    expect(await descendantMoveResponse.json()).toEqual({
      message: '不能移动到自己或子级权限资源下',
    })
  })

  it('defaults open target to blank when updating a resource to an external link', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'test-system:user',
      path: '/system/users',
    })

    const response = await app.request(`/api/system/resources/${body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: RESOURCE_TYPE_EXTERNAL,
        externalUrl: 'https://example.com/users',
      }),
      headers: { 'content-type': 'application/json' },
    })
    const responseBody = (await response.json()) as Resource

    expect(response.status).toBe(200)
    expect(responseBody).toMatchObject({
      type: RESOURCE_TYPE_EXTERNAL,
      path: null,
      externalUrl: 'https://example.com/users',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
    })
  })

  it('defaults open target to self when updating an external link to an internal menu', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body } = await createResource(app, {
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'Docs',
      code: 'test-system:docs',
      externalUrl: 'https://example.com/docs',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
    })

    const response = await app.request(`/api/system/resources/${body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: RESOURCE_TYPE_MENU,
        path: '/system/docs',
      }),
      headers: { 'content-type': 'application/json' },
    })
    const responseBody = (await response.json()) as Resource

    expect(response.status).toBe(200)
    expect(responseBody).toMatchObject({
      type: RESOURCE_TYPE_MENU,
      path: '/system/docs',
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })
  })

  it('preserves external open target on partial updates', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body } = await createResource(app, {
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'Docs',
      code: 'test-system:docs',
      externalUrl: 'https://example.com/docs',
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })

    const response = await app.request(`/api/system/resources/${body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Documentation',
      }),
      headers: { 'content-type': 'application/json' },
    })
    const responseBody = (await response.json()) as Resource

    expect(response.status).toBe(200)
    expect(responseBody).toMatchObject({
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'Documentation',
      externalUrl: 'https://example.com/docs',
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })
  })

  it('rejects invalid final type fields on update', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'test-system',
    })

    const response = await app.request(`/api/system/resources/${body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ type: RESOURCE_TYPE_MENU }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      field: 'path',
      message: '内部菜单路径不能为空',
    })
  })

  it('normalizes omitted-type update fields against the existing resource type', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: menu } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'test-system:user',
      path: '/system/users',
    })
    const { body: directory } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'test-system',
    })
    const { body: action } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Export Users',
      code: 'test-system:user:export',
    })

    for (const resource of [menu, directory, action]) {
      const response = await app.request(`/api/system/resources/${resource.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ externalUrl: 'not-a-url' }),
        headers: { 'content-type': 'application/json' },
      })
      const responseBody = (await response.json()) as Resource

      expect(response.status).toBe(200)
      expect(responseBody.externalUrl).toBe(null)
    }
  })

  it('rejects invalid external urls when updating an existing external resource', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body } = await createResource(app, {
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'Docs',
      code: 'test-system:docs',
      externalUrl: 'https://example.com/docs',
    })

    const response = await app.request(`/api/system/resources/${body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ externalUrl: 'not-a-url' }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      field: 'externalUrl',
      message: '外链地址无效',
    })
  })

  it('rejects duplicate resource codes on create and update', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'test-system',
    })
    const { body: userMenu } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'test-system:user',
      path: '/system/users',
    })

    const createConflict = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Duplicate',
      code: 'test-system',
    })
    expect(createConflict.response.status).toBe(409)
    expect(createConflict.body as unknown as ErrorResponse).toMatchObject({
      message: '权限编码已存在',
    })

    const updateConflict = await app.request(`/api/system/resources/${userMenu.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ code: 'test-system' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateConflict.status).toBe(409)
    expect(await updateConflict.json()).toEqual({ message: '权限编码已存在' })
  })

  it('soft deletes empty resources and rejects deleting resources with children', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'test-system',
    })
    const { body: child } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Create User',
      code: 'test-system:user:create',
      parentId: root.id,
    })

    const rootDeleteResponse = await app.request(`/api/system/resources/${root.id}`, {
      method: 'DELETE',
    })
    expect(rootDeleteResponse.status).toBe(409)
    expect(await rootDeleteResponse.json()).toEqual({
      message: '权限资源存在子级权限资源，不能删除',
    })

    const childDeleteResponse = await app.request(`/api/system/resources/${child.id}`, {
      method: 'DELETE',
    })
    expect(childDeleteResponse.status).toBe(204)

    const storedRows = await database
      .select()
      .from(systemResources)
      .where(eq(systemResources.id, child.id))
    expect(storedRows).toHaveLength(1)
    expect(storedRows[0]?.deletedAt).toBeInstanceOf(Date)
    expect(storedRows[0]?.status).toBe(RESOURCE_STATUS_ENABLED)

    const detailResponse = await app.request(`/api/system/resources/${child.id}`)
    expect(detailResponse.status).toBe(404)
    expect(await detailResponse.json()).toEqual({ message: '权限资源不存在' })

    const listAfterDeleteResponse = await app.request('/api/system/resources?page=1&pageSize=10')
    const listAfterDeleteBody = (await listAfterDeleteResponse.json()) as ResourceListResponse

    expect(listAfterDeleteResponse.status).toBe(200)
    expect(listAfterDeleteBody.page).toBe(1)
    expect(listAfterDeleteBody.pageSize).toBe(10)
    expect(listAfterDeleteBody.total).toBeGreaterThanOrEqual(1)
    expect(listAfterDeleteBody.list).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: root.id })]),
    )

    const treeAfterDeleteResponse = await app.request('/api/system/resources/tree')
    const treeAfterDeleteBody = (await treeAfterDeleteResponse.json()) as ResourceTreeNode[]

    expect(treeAfterDeleteResponse.status).toBe(200)
    const deletedTreeRoot = treeAfterDeleteBody.find((resource) => resource.id === root.id)
    expect(deletedTreeRoot).toMatchObject({
      id: root.id,
      children: [],
    })
  })

  it('rejects deleting resources assigned to roles', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: resource } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Export Users',
      code: 'test-system:user:export',
    })

    const roleId = randomUUID()
    await database.insert(roles).values({
      id: roleId,
      name: 'Role With Resource',
      code: 'resource-linked-role',
    })
    await database.insert(roleResources).values({
      roleId,
      resourceId: resource.id,
      createdAt: new Date(),
    })

    const response = await app.request(`/api/system/resources/${resource.id}`, {
      method: 'DELETE',
    })
    expect(response.status).toBe(409)

    const body = (await response.json()) as ErrorResponse
    expect(body).toEqual({ message: '权限资源存在角色授权，不能删除' })
  })

  it('returns invalid parent errors for create and update requests', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const missingParentId = randomUUID()

    const createResponse = await app.request('/api/system/resources', {
      method: 'POST',
      body: JSON.stringify({
        type: RESOURCE_TYPE_ACTION,
        name: 'Ghost Action',
        code: 'ghost:action',
        parentId: missingParentId,
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '上级权限资源不存在' })

    const { body: existing } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Existing',
      code: 'existing',
    })
    const updateResponse = await app.request(`/api/system/resources/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: missingParentId }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(400)
    expect(await updateResponse.json()).toEqual({ message: '上级权限资源不存在' })
  })

  it('returns siblings sorted by sortOrder in ascending order', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'test-system',
    })

    const { body: later } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Later',
      code: 'test-system:later',
      parentId: root.id,
      path: '/system/later',
      sortOrder: 20,
    })
    const { body: first } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'First',
      code: 'test-system:first',
      parentId: root.id,
      path: '/system/first',
      sortOrder: 10,
    })

    const listResponse = await app.request(
      `/api/system/resources?parentId=${root.id}&page=1&pageSize=10`,
    )
    const listBody = (await listResponse.json()) as ResourceListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody.list).toHaveLength(2)
    expect(listBody.list[0]?.id).toBe(first.id)
    expect(listBody.list[1]?.id).toBe(later.id)
  })
})
