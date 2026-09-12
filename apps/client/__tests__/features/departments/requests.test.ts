import { beforeEach, describe, expect, it } from 'vitest'
import { DEPARTMENT_STATUS_ENABLED } from '@rev30/contracts'
import {
  createDepartment,
  deleteDepartment,
  getDepartment,
  getDepartmentTree,
  getDepartmentTreeOptions,
  updateDepartment,
} from '../../../src/features/departments/requests'
import { useAuthStore } from '../../../src/stores/auth'
import {
  createFetchMock,
  emptyResponse,
  expectFetchCall,
  expectJsonBody,
  jsonResponse,
} from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const departmentRequestId = '22222222-2222-4222-8222-222222222222'

const departmentRequestResponse = {
  id: departmentRequestId,
  parentId: null,
  name: '总部',
  code: 'hq',
  status: DEPARTMENT_STATUS_ENABLED,
  sortOrder: 1,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

const updatedDepartmentRequestResponse = {
  ...departmentRequestResponse,
  name: '研发中心',
  code: 'eng',
  sortOrder: 2,
  updatedAt: '2026-05-02T00:00:00.000Z',
}

const departmentCreateInput = {
  name: '总部',
  code: 'hq',
  parentId: null,
  status: DEPARTMENT_STATUS_ENABLED,
  sortOrder: 1,
} satisfies Parameters<typeof createDepartment>[0]

const departmentUpdateInput = {
  name: '研发中心',
  code: 'eng',
  parentId: null,
  status: DEPARTMENT_STATUS_ENABLED,
  sortOrder: 2,
} satisfies Parameters<typeof updateDepartment>[1]

beforeEach(() => {
  createTestPinia()
  useAuthStore().accessToken = 'access-token'
})

describe('departments request helpers', () => {
  it('parses department tree options responses from the department tree options endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '33333333-3333-4333-8333-333333333333',
          parentId: null,
          name: '总部',
          code: 'hq',
          status: DEPARTMENT_STATUS_ENABLED,
          children: [
            {
              id: '44444444-4444-4444-8444-444444444444',
              parentId: '33333333-3333-4333-8333-333333333333',
              name: '研发中心',
              code: 'eng',
              status: DEPARTMENT_STATUS_ENABLED,
              children: [],
            },
          ],
        },
      ]),
    )

    const result = await getDepartmentTreeOptions(['33333333-3333-4333-8333-333333333333'])

    expect(result[0]?.children[0]?.name).toBe('研发中心')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/departments/options/tree',
      query: {
        includeIds: '33333333-3333-4333-8333-333333333333',
      },
    })
  })

  it('parses department tree responses from the system departments endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '22222222-2222-4222-8222-222222222222',
          parentId: null,
          name: '总部',
          code: 'hq',
          status: DEPARTMENT_STATUS_ENABLED,
          sortOrder: 1,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
          children: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              parentId: '22222222-2222-4222-8222-222222222222',
              name: '研发中心',
              code: 'eng',
              status: DEPARTMENT_STATUS_ENABLED,
              sortOrder: 1,
              createdAt: '2026-05-02T00:00:00.000Z',
              updatedAt: '2026-05-02T00:00:00.000Z',
              children: [],
            },
          ],
        },
      ]),
    )

    const result = await getDepartmentTree()

    expect(result[0]?.children[0]?.code).toBe('eng')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/departments/tree',
    })
  })

  it('parses a department detail response', async () => {
    const fetchMock = createFetchMock(jsonResponse(departmentRequestResponse))

    await expect(getDepartment(departmentRequestId)).resolves.toEqual(departmentRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/system/departments/${departmentRequestId}`,
    })
  })

  it('sends department create input and parses the created department', async () => {
    const fetchMock = createFetchMock(jsonResponse(departmentRequestResponse, { status: 201 }))

    await expect(createDepartment(departmentCreateInput)).resolves.toEqual(
      departmentRequestResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/departments',
    })
    expectJsonBody(fetchMock, 0, departmentCreateInput)
  })

  it('sends department update input and parses the updated department', async () => {
    const fetchMock = createFetchMock(jsonResponse(updatedDepartmentRequestResponse))

    await expect(updateDepartment(departmentRequestId, departmentUpdateInput)).resolves.toEqual(
      updatedDepartmentRequestResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: `/api/system/departments/${departmentRequestId}`,
    })
    expectJsonBody(fetchMock, 0, departmentUpdateInput)
  })

  it('deletes a department with an empty response', async () => {
    const fetchMock = createFetchMock(emptyResponse())

    await expect(deleteDepartment(departmentRequestId)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/system/departments/${departmentRequestId}`,
    })
  })
})
