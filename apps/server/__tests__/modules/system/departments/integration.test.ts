import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  type Department,
  type DepartmentListResponse,
  type DepartmentTreeOptionsResponse,
  type DepartmentTreeNode,
} from '@rev30/contracts'
import { systemDepartments, systemUserDepartments, systemUsers } from '../../../../src/db/schema'
import { createProtectedSystemRouteTestApp, createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'
import { createDepartmentRoutes } from '../../../../src/modules/system/departments/routes'

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
        usernamePrefix: 'department-routes-admin',
      })
    ).authHeaders

  return createProtectedSystemRouteTestApp(
    database,
    '/api/system/departments',
    createDepartmentRoutes(database),
    headers,
  )
}

async function createDepartment(
  app: Hono,
  body: {
    name: string
    code: string
    parentId?: string | null
    status?: 0 | 1
    sortOrder?: number
  },
) {
  const response = await app.request('/api/system/departments', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

  return { body: (await response.json()) as Department, response }
}

describe('department routes', () => {
  it('creates departments in the database and returns paginated departments', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const { body, response } = await createDepartment(app, {
      name: 'Engineering',
      code: 'engineering',
      sortOrder: 10,
    })

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      name: 'Engineering',
      code: 'engineering',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 10,
    })
    expect(body.createdAt).toEqual(expect.any(String))
    expect(body.updatedAt).toEqual(expect.any(String))

    const storedDepartments = await database.select().from(systemDepartments)
    expect(storedDepartments).toHaveLength(1)
    expect(storedDepartments[0]?.code).toBe('engineering')

    const listResponse = await app.request('/api/system/departments?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as DepartmentListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
    })
    expect(listBody.list).toHaveLength(1)
    expect(listBody.list[0]).toMatchObject({
      id: body.id,
    })
  })

  it('filters department lists by keyword, status, and parent id', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const { body: root } = await createDepartment(app, {
      name: 'Company',
      code: 'company',
    })

    const { body: engineering } = await createDepartment(app, {
      name: 'Engineering',
      code: 'engineering',
      parentId: root.id,
      status: DEPARTMENT_STATUS_DISABLED,
    })

    await createDepartment(app, {
      name: 'Sales',
      code: 'sales',
      parentId: root.id,
      status: DEPARTMENT_STATUS_ENABLED,
    })

    const listResponse = await app.request(
      `/api/system/departments?keyword=eng&status=0&parentId=${root.id}`,
    )
    const listBody = (await listResponse.json()) as DepartmentListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody.total).toBe(1)
    expect(listBody.list).toHaveLength(1)
    expect(listBody.list[0]).toMatchObject({
      id: engineering.id,
      name: 'Engineering',
      code: 'engineering',
      parentId: root.id,
      status: DEPARTMENT_STATUS_DISABLED,
    })
  })

  it('returns department details and department trees', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const { body: root } = await createDepartment(app, {
      name: 'Company',
      code: 'company',
      sortOrder: 1,
    })

    const { body: child } = await createDepartment(app, {
      name: 'Engineering',
      code: 'engineering',
      parentId: root.id,
      sortOrder: 2,
    })

    const detailResponse = await app.request(`/api/system/departments/${child.id}`)
    const detailBody = (await detailResponse.json()) as Department

    expect(detailResponse.status).toBe(200)
    expect(detailBody).toMatchObject({
      id: child.id,
      parentId: root.id,
      code: 'engineering',
    })

    const treeResponse = await app.request('/api/system/departments/tree')
    const treeBody = (await treeResponse.json()) as DepartmentTreeNode[]

    expect(treeResponse.status).toBe(200)
    expect(treeBody).toHaveLength(1)
    expect(treeBody[0]).toMatchObject({
      id: root.id,
      code: 'company',
    })
    expect(treeBody[0]?.children).toHaveLength(1)
    expect(treeBody[0]?.children[0]).toMatchObject({
      id: child.id,
      parentId: root.id,
      code: 'engineering',
      children: [],
    })
  })

  it('returns lightweight department tree options with enabled and non-deleted nodes by default', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: root } = await createDepartment(app, {
      name: 'Company',
      code: 'company',
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 1,
    })
    const { body: enabledChild } = await createDepartment(app, {
      name: 'Engineering',
      code: 'engineering',
      parentId: root.id,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 2,
    })
    const { body: disabledChild } = await createDepartment(app, {
      name: 'Disabled',
      code: 'disabled',
      parentId: root.id,
      status: DEPARTMENT_STATUS_DISABLED,
      sortOrder: 3,
    })

    await app.request(`/api/system/departments/${disabledChild.id}`, { method: 'DELETE' })

    const response = await app.request('/api/system/departments/options/tree')
    const body = (await response.json()) as DepartmentTreeOptionsResponse

    expect(response.status).toBe(200)
    expect(body).toEqual([
      {
        id: root.id,
        parentId: null,
        name: 'Company',
        code: 'company',
        status: DEPARTMENT_STATUS_ENABLED,
        children: [
          {
            id: enabledChild.id,
            parentId: root.id,
            name: 'Engineering',
            code: 'engineering',
            status: DEPARTMENT_STATUS_ENABLED,
            children: [],
          },
        ],
      },
    ])
    expect(body[0]).not.toHaveProperty('sortOrder')
    expect(body[0]).not.toHaveProperty('createdAt')
    expect(body[0]).not.toHaveProperty('updatedAt')
  })

  it('does not expose disabled parent when only enabled descendant matches default options tree', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: disabledParent } = await createDepartment(app, {
      name: 'Disabled Parent',
      code: 'disabled-parent-default',
      status: DEPARTMENT_STATUS_DISABLED,
    })
    const { body: enabledChild } = await createDepartment(app, {
      name: 'Enabled Child',
      code: 'enabled-child-default',
      parentId: disabledParent.id,
      status: DEPARTMENT_STATUS_ENABLED,
    })

    const response = await app.request('/api/system/departments/options/tree')
    const body = (await response.json()) as DepartmentTreeOptionsResponse

    expect(response.status).toBe(200)
    expect(JSON.stringify(body)).not.toContain(disabledParent.id)
    expect(JSON.stringify(body)).not.toContain(enabledChild.id)
  })

  it('includes disabled departments and required non-deleted ancestors when includeIds is provided', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: enabledRoot } = await createDepartment(app, {
      name: 'Enabled Root',
      code: 'enabled-root',
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 10,
    })
    const { body: disabledRoot } = await createDepartment(app, {
      name: 'Disabled Root',
      code: 'disabled-root',
      status: DEPARTMENT_STATUS_DISABLED,
      sortOrder: 20,
    })
    const { body: disabledParent } = await createDepartment(app, {
      name: 'Disabled Parent',
      code: 'disabled-parent',
      parentId: disabledRoot.id,
      status: DEPARTMENT_STATUS_DISABLED,
      sortOrder: 1,
    })
    const { body: disabledLeaf } = await createDepartment(app, {
      name: 'Disabled Leaf',
      code: 'disabled-leaf',
      parentId: disabledParent.id,
      status: DEPARTMENT_STATUS_DISABLED,
      sortOrder: 1,
    })
    const { body: deletedLeaf } = await createDepartment(app, {
      name: 'Deleted Leaf',
      code: 'deleted-leaf',
      parentId: enabledRoot.id,
      status: DEPARTMENT_STATUS_DISABLED,
    })

    await app.request(`/api/system/departments/${deletedLeaf.id}`, { method: 'DELETE' })

    const response = await app.request(
      `/api/system/departments/options/tree?includeIds=${disabledLeaf.id},${deletedLeaf.id},${randomUUID()}`,
    )
    const body = (await response.json()) as DepartmentTreeOptionsResponse

    expect(response.status).toBe(200)
    expect(body).toHaveLength(2)
    const disabledRootNode = body.find((item) => item.id === disabledRoot.id)
    const enabledRootNode = body.find((item) => item.id === enabledRoot.id)
    expect(disabledRootNode).toMatchObject({
      id: disabledRoot.id,
      status: DEPARTMENT_STATUS_DISABLED,
      children: [
        {
          id: disabledParent.id,
          status: DEPARTMENT_STATUS_DISABLED,
          children: [
            {
              id: disabledLeaf.id,
              status: DEPARTMENT_STATUS_DISABLED,
              children: [],
            },
          ],
        },
      ],
    })
    expect(enabledRootNode).toMatchObject({
      id: enabledRoot.id,
      status: DEPARTMENT_STATUS_ENABLED,
    })
    expect(JSON.stringify(body)).not.toContain(deletedLeaf.id)
  })

  it('does not include includeIds nodes when required ancestor is deleted', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: deletedParent } = await createDepartment(app, {
      name: 'Deleted Parent',
      code: 'deleted-parent',
      status: DEPARTMENT_STATUS_DISABLED,
    })
    const { body: includedChild } = await createDepartment(app, {
      name: 'Included Child',
      code: 'included-child',
      parentId: deletedParent.id,
      status: DEPARTMENT_STATUS_DISABLED,
    })

    await database
      .update(systemDepartments)
      .set({
        deletedAt: new Date(),
      })
      .where(eq(systemDepartments.id, deletedParent.id))

    const response = await app.request(
      `/api/system/departments/options/tree?includeIds=${includedChild.id}`,
    )
    const body = (await response.json()) as DepartmentTreeOptionsResponse

    expect(response.status).toBe(200)
    expect(JSON.stringify(body)).not.toContain(deletedParent.id)
    expect(JSON.stringify(body)).not.toContain(includedChild.id)
  })

  it('updates department fields and rejects moving a department under itself or descendants', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: root } = await createDepartment(app, { name: 'Company', code: 'company' })
    const { body: child } = await createDepartment(app, {
      name: 'Engineering',
      code: 'engineering',
      parentId: root.id,
    })

    const updateResponse = await app.request(`/api/system/departments/${child.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Platform Engineering',
        code: 'platform-engineering',
        sortOrder: 20,
      }),
      headers: { 'content-type': 'application/json' },
    })
    const updateBody = (await updateResponse.json()) as Department

    expect(updateResponse.status).toBe(200)
    expect(updateBody).toMatchObject({
      id: child.id,
      name: 'Platform Engineering',
      code: 'platform-engineering',
      sortOrder: 20,
    })

    const selfMoveResponse = await app.request(`/api/system/departments/${child.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: child.id }),
      headers: { 'content-type': 'application/json' },
    })

    expect(selfMoveResponse.status).toBe(409)
    expect(await selfMoveResponse.json()).toEqual({ message: '不能移动到自己或子部门下' })

    const descendantMoveResponse = await app.request(`/api/system/departments/${root.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: child.id }),
      headers: { 'content-type': 'application/json' },
    })

    expect(descendantMoveResponse.status).toBe(409)
    expect(await descendantMoveResponse.json()).toEqual({ message: '不能移动到自己或子部门下' })
  })

  it('rejects duplicate department codes on create and update', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    await createDepartment(app, { name: 'Engineering', code: 'engineering' })
    const { body: sales } = await createDepartment(app, { name: 'Sales', code: 'sales' })

    const createConflict = await createDepartment(app, { name: 'Duplicate', code: 'engineering' })
    expect(createConflict.response.status).toBe(409)
    expect(createConflict.body).toEqual({
      field: 'code',
      message: '编码已存在',
    })

    const updateConflict = await app.request(`/api/system/departments/${sales.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ code: 'engineering' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateConflict.status).toBe(409)
    expect(await updateConflict.json()).toEqual({
      field: 'code',
      message: '编码已存在',
    })
  })

  it('allows recreating a department code after soft delete', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created } = await createDepartment(app, {
      name: 'Engineering',
      code: 'engineering-recreated',
    })

    const deleteResponse = await app.request(`/api/system/departments/${created.id}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)

    const recreated = await createDepartment(app, {
      name: 'Engineering Recreated',
      code: 'engineering-recreated',
    })
    expect(recreated.response.status).toBe(201)
    expect(recreated.body).toMatchObject({
      name: 'Engineering Recreated',
      code: 'engineering-recreated',
    })
  })

  it('soft deletes empty departments and rejects deleting departments with children', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: root } = await createDepartment(app, { name: 'Company', code: 'company' })
    const { body: child } = await createDepartment(app, {
      name: 'Engineering',
      code: 'engineering',
      parentId: root.id,
    })

    const rootDeleteResponse = await app.request(`/api/system/departments/${root.id}`, {
      method: 'DELETE',
    })
    expect(rootDeleteResponse.status).toBe(409)
    expect(await rootDeleteResponse.json()).toEqual({ message: '部门存在子部门，不能删除' })

    const childDeleteResponse = await app.request(`/api/system/departments/${child.id}`, {
      method: 'DELETE',
    })
    expect(childDeleteResponse.status).toBe(204)

    const storedRows = await database
      .select()
      .from(systemDepartments)
      .where(eq(systemDepartments.id, child.id))
    expect(storedRows).toHaveLength(1)
    expect(storedRows[0]?.deletedAt).toBeInstanceOf(Date)
    expect(storedRows[0]?.status).toBe(DEPARTMENT_STATUS_ENABLED)

    const detailResponse = await app.request(`/api/system/departments/${child.id}`)
    const detailBody = (await detailResponse.json()) as ErrorResponse
    expect(detailResponse.status).toBe(404)
    expect(detailBody).toEqual({ message: '部门不存在' })
  })

  it('returns invalid parent errors for create and update requests', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const missingParentId = randomUUID()

    const createResponse = await app.request('/api/system/departments', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Ghost Child',
        code: 'ghost-child',
        parentId: missingParentId,
      }),
      headers: { 'content-type': 'application/json' },
    })
    const createBody = (await createResponse.json()) as ErrorResponse

    expect(createResponse.status).toBe(400)
    expect(createBody).toEqual({ message: '上级部门不存在' })

    const { body: existing } = await createDepartment(app, { name: 'Support', code: 'support' })
    const updateResponse = await app.request(`/api/system/departments/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: missingParentId }),
      headers: { 'content-type': 'application/json' },
    })
    const updateBody = (await updateResponse.json()) as ErrorResponse

    expect(updateResponse.status).toBe(400)
    expect(updateBody).toEqual({ message: '上级部门不存在' })
  })

  it('rejects deleting departments with related users', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: department } = await createDepartment(app, {
      name: 'Operations',
      code: 'operations',
    })
    const userId = randomUUID()

    await database.insert(systemUsers).values({
      id: userId,
      username: 'linked-user',
      nickname: 'Linked User',
    })
    await database.insert(systemUserDepartments).values({
      userId,
      departmentId: department.id,
    })

    const deleteResponse = await app.request(`/api/system/departments/${department.id}`, {
      method: 'DELETE',
    })
    const deleteBody = (await deleteResponse.json()) as ErrorResponse

    expect(deleteResponse.status).toBe(409)
    expect(deleteBody).toEqual({ message: '部门存在关联用户，不能删除' })
  })
})
