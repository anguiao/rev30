import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  type Department,
  type DepartmentListResponse,
  type DepartmentTreeNode,
} from '@rev30/shared'
import { departments } from '../../../../src/db/schema'
import { createTestDb } from '../../../helpers/db'
import { createDepartmentRoutes } from '../../../../src/modules/system/departments/routes'

type ErrorResponse = {
  message: string
}

function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/system/departments', createDepartmentRoutes(database))
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
    const app = createTestApp(database)

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
    const app = createTestApp(database)

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
    const app = createTestApp(database)

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
    const app = createTestApp(database)

    const listResponse = await app.request('/api/system/departments?page=0')
    const listBody = (await listResponse.json()) as ErrorResponse

    expect(listResponse.status).toBe(400)
    expect(listBody).toEqual({ message: '查询参数无效' })

    const detailResponse = await app.request('/api/system/departments/not-a-uuid')
    const detailBody = (await detailResponse.json()) as ErrorResponse

    expect(detailResponse.status).toBe(400)
    expect(detailBody).toEqual({ message: '部门 ID 无效' })
  })
})
