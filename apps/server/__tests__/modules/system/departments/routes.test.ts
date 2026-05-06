import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  type Department,
  type DepartmentListResponse,
  type DepartmentTreeNode,
} from '@rev30/shared'
import { departments, userDepartments, users } from '../../../../src/db/schema'
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

    const storedDepartments = await database.select().from(departments)
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

  it('returns validation errors for invalid query and id params', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const listResponse = await app.request('/api/system/departments?page=0')
    const listBody = (await listResponse.json()) as ErrorResponse

    expect(listResponse.status).toBe(400)
    expect(listBody).toEqual({ message: '查询参数无效' })

    const detailResponse = await app.request('/api/system/departments/not-a-uuid')
    const detailBody = (await detailResponse.json()) as ErrorResponse

    expect(detailResponse.status).toBe(400)
    expect(detailBody).toEqual({ message: '部门 ID 无效' })
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

    const updateConflict = await app.request(`/api/system/departments/${sales.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ code: 'engineering' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateConflict.status).toBe(409)
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

    const storedRows = await database.select().from(departments).where(eq(departments.id, child.id))
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
    expect(createBody).toEqual({ message: '父部门不存在' })

    const { body: existing } = await createDepartment(app, { name: 'Support', code: 'support' })
    const updateResponse = await app.request(`/api/system/departments/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: missingParentId }),
      headers: { 'content-type': 'application/json' },
    })
    const updateBody = (await updateResponse.json()) as ErrorResponse

    expect(updateResponse.status).toBe(400)
    expect(updateBody).toEqual({ message: '父部门不存在' })
  })

  it('rejects deleting departments with related users', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: department } = await createDepartment(app, {
      name: 'Operations',
      code: 'operations',
    })
    const userId = randomUUID()

    await database.insert(users).values({
      id: userId,
      username: 'linked-user',
      nickname: 'Linked User',
    })
    await database.insert(userDepartments).values({
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

  it('returns 401 when requesting department routes without authentication', async () => {
    const database = await createTestDb()
    const app = createProtectedSystemRouteTestApp(
      database,
      '/api/system/departments',
      createDepartmentRoutes(database),
    )

    const response = await app.request('/api/system/departments')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
  })

  it('returns 403 when the user lacks department list access', async () => {
    const database = await createTestDb()
    const denied = await createSystemAccessFixture(database, {
      accessCodes: ['system:user:list'],
      usernamePrefix: 'department-routes-forbidden',
    })
    const app = await createTestApp(database, denied.authHeaders)

    const response = await app.request('/api/system/departments')

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ message: '无权访问' })
  })

  it('allows admin users to access protected department routes without explicit role resources', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request('/api/system/departments')

    expect(response.status).toBe(200)
  })
})
