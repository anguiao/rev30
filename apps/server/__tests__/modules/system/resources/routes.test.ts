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
import { systemResources } from '../../../../src/db/schema'
import { createTestDb } from '../../../helpers/db'
import { createResourceRoutes } from '../../../../src/modules/system/resources/routes'

type ErrorResponse = {
  message: string
}

function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/system/resources', createResourceRoutes(database))
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
    const app = createTestApp(database)

    const { body, response } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
      icon: 'i-[lucide--settings]',
      sortOrder: 10,
    })

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      parentId: null,
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: 'i-[lucide--settings]',
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 10,
    })
    expect(body.createdAt).toEqual(expect.any(String))
    expect(body.updatedAt).toEqual(expect.any(String))

    const storedResources = await database.select().from(systemResources)
    expect(storedResources).toHaveLength(1)
    expect(storedResources[0]?.code).toBe('system')

    const listResponse = await app.request('/api/system/resources?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as ResourceListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
    })
    expect(listBody.list[0]).toMatchObject({ id: body.id, code: 'system' })
  })

  it('creates typed menus, external links, and action permission points', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })

    const { body: menu } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
      parentId: root.id,
      path: '/system/users',
      hidden: true,
    })
    const { body: external } = await createResource(app, {
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'Docs',
      code: 'system:docs',
      externalUrl: 'https://example.com/docs',
    })
    const { body: action } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Export Users',
      code: 'system:user:export',
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

  it('filters resource lists by keyword, type, status, and parent id', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })
    const { body: users } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
      parentId: root.id,
      path: '/system/users',
      status: RESOURCE_STATUS_DISABLED,
    })
    await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Departments',
      code: 'system:department',
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
      code: 'system:user',
      type: RESOURCE_TYPE_MENU,
      status: RESOURCE_STATUS_DISABLED,
    })
  })

  it('returns resource details and resource trees', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
      sortOrder: 1,
    })
    const { body: child } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Create User',
      code: 'system:user:create',
      parentId: root.id,
      sortOrder: 2,
    })

    const detailResponse = await app.request(`/api/system/resources/${child.id}`)
    const detailBody = (await detailResponse.json()) as Resource

    expect(detailResponse.status).toBe(200)
    expect(detailBody).toMatchObject({
      id: child.id,
      parentId: root.id,
      code: 'system:user:create',
    })

    const treeResponse = await app.request('/api/system/resources/tree')
    const treeBody = (await treeResponse.json()) as ResourceTreeNode[]

    expect(treeResponse.status).toBe(200)
    expect(treeBody).toHaveLength(1)
    expect(treeBody[0]).toMatchObject({ id: root.id, code: 'system' })
    expect(treeBody[0]?.children).toHaveLength(1)
    expect(treeBody[0]?.children[0]).toMatchObject({
      id: child.id,
      parentId: root.id,
      code: 'system:user:create',
      children: [],
    })
  })

  it('returns validation errors for invalid query, id params, and request bodies', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const listResponse = await app.request('/api/system/resources?page=0')
    expect(listResponse.status).toBe(400)
    expect(await listResponse.json()).toEqual({ message: '查询参数无效' })

    const detailResponse = await app.request('/api/system/resources/not-a-uuid')
    expect(detailResponse.status).toBe(400)
    expect(await detailResponse.json()).toEqual({ message: '资源 ID 无效' })

    const createResponse = await app.request('/api/system/resources', {
      method: 'POST',
      body: JSON.stringify({
        type: RESOURCE_TYPE_MENU,
        name: 'Users',
        code: 'system:user',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '请求体无效' })
  })

  it('updates resource fields, normalizes type-specific fields, and rejects circular moves', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })
    const { body: child } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
      parentId: root.id,
      path: '/system/users',
    })

    const updateResponse = await app.request(`/api/system/resources/${child.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: RESOURCE_TYPE_EXTERNAL,
        name: 'User Docs',
        code: 'system:user-docs',
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
      code: 'system:user-docs',
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
    expect(await selfMoveResponse.json()).toEqual({ message: '不能移动到自己或子资源下' })

    const descendantMoveResponse = await app.request(`/api/system/resources/${root.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: child.id }),
      headers: { 'content-type': 'application/json' },
    })
    expect(descendantMoveResponse.status).toBe(409)
    expect(await descendantMoveResponse.json()).toEqual({ message: '不能移动到自己或子资源下' })
  })

  it('defaults open target to blank when updating a resource to an external link', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
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

  it('preserves external open target on partial updates', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body } = await createResource(app, {
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'Docs',
      code: 'system:docs',
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
    const app = createTestApp(database)
    const { body } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })

    const response = await app.request(`/api/system/resources/${body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ type: RESOURCE_TYPE_MENU }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '内部菜单路径不能为空' })
  })

  it('rejects duplicate resource codes on create and update', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })
    const { body: userMenu } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
      path: '/system/users',
    })

    const createConflict = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Duplicate',
      code: 'system',
    })
    expect(createConflict.response.status).toBe(409)
    expect(createConflict.body as unknown as ErrorResponse).toMatchObject({
      message: '资源编码已存在',
    })

    const updateConflict = await app.request(`/api/system/resources/${userMenu.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ code: 'system' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateConflict.status).toBe(409)
    expect(await updateConflict.json()).toEqual({ message: '资源编码已存在' })
  })

  it('soft deletes empty resources and rejects deleting resources with children', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })
    const { body: child } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Create User',
      code: 'system:user:create',
      parentId: root.id,
    })

    const rootDeleteResponse = await app.request(`/api/system/resources/${root.id}`, {
      method: 'DELETE',
    })
    expect(rootDeleteResponse.status).toBe(409)
    expect(await rootDeleteResponse.json()).toEqual({ message: '资源存在子资源，不能删除' })

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
    expect(await detailResponse.json()).toEqual({ message: '资源不存在' })

    const listAfterDeleteResponse = await app.request('/api/system/resources?page=1&pageSize=10')
    const listAfterDeleteBody = (await listAfterDeleteResponse.json()) as ResourceListResponse

    expect(listAfterDeleteResponse.status).toBe(200)
    expect(listAfterDeleteBody).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
    })
    expect(listAfterDeleteBody.list).toHaveLength(1)
    expect(listAfterDeleteBody.list[0]).toMatchObject({ id: root.id })

    const treeAfterDeleteResponse = await app.request('/api/system/resources/tree')
    const treeAfterDeleteBody = (await treeAfterDeleteResponse.json()) as ResourceTreeNode[]

    expect(treeAfterDeleteResponse.status).toBe(200)
    expect(treeAfterDeleteBody).toHaveLength(1)
    expect(treeAfterDeleteBody[0]).toMatchObject({ id: root.id })
    expect(treeAfterDeleteBody[0]?.children).toEqual([])
  })

  it('returns invalid parent errors for create and update requests', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
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
    expect(await createResponse.json()).toEqual({ message: '父资源不存在' })

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
    expect(await updateResponse.json()).toEqual({ message: '父资源不存在' })
  })

  it('returns siblings sorted by sortOrder in ascending order', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })

    const { body: later } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Later',
      code: 'system:later',
      parentId: root.id,
      path: '/system/later',
      sortOrder: 20,
    })
    const { body: first } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'First',
      code: 'system:first',
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
