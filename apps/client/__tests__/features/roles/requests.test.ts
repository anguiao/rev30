import { beforeEach, describe, expect, it } from 'vitest'
import { ROLE_STATUS_ENABLED } from '@rev30/contracts'
import {
  createRole,
  deleteRole,
  getRole,
  getRoleOptions,
  listRoles,
  updateRole,
} from '../../../src/features/roles/requests'
import { useAuthStore } from '../../../src/stores/auth'
import {
  createFetchMock,
  emptyResponse,
  expectFetchCall,
  expectJsonBody,
  jsonResponse,
} from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const roleRequestId = '11111111-1111-4111-8111-111111111111'

const roleRequestResponse = {
  id: roleRequestId,
  name: '运营',
  code: 'operator',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 1,
  resources: [],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

const updatedRoleRequestResponse = {
  ...roleRequestResponse,
  name: '运营主管',
  sortOrder: 2,
  updatedAt: '2026-05-02T00:00:00.000Z',
}

const roleCreateInput = {
  name: '运营',
  code: 'operator',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 1,
  resourceIds: [],
} satisfies Parameters<typeof createRole>[0]

const roleUpdateInput = {
  name: '运营主管',
  code: 'operator',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 2,
  resourceIds: [],
} satisfies Parameters<typeof updateRole>[1]

beforeEach(() => {
  createTestPinia()
  useAuthStore().accessToken = 'access-token'
})

describe('roles request helpers', () => {
  it('parses role options responses from the roles options endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: '管理员',
          code: 'admin',
          status: ROLE_STATUS_ENABLED,
        },
      ]),
    )

    const result = await getRoleOptions(['22222222-2222-4222-8222-222222222222'])

    expect(result[0]?.name).toBe('管理员')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/roles/options',
      query: {
        includeIds: '22222222-2222-4222-8222-222222222222',
      },
    })
  })

  it('parses list responses from the system roles endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: '管理员',
            code: 'admin',
            status: ROLE_STATUS_ENABLED,
            sortOrder: 1,
            userCount: 2,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 2,
        pageSize: 10,
      }),
    )

    const result = await listRoles({
      page: 2,
      pageSize: 10,
      keyword: 'admin',
      status: ROLE_STATUS_ENABLED,
    })

    expect(result.list[0]?.code).toBe('admin')
    expect(result.total).toBe(1)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/roles',
      query: {
        page: '2',
        pageSize: '10',
        keyword: 'admin',
        status: '1',
      },
    })
  })

  it('sends role create input and parses the created role', async () => {
    const fetchMock = createFetchMock(jsonResponse(roleRequestResponse))

    await expect(createRole(roleCreateInput)).resolves.toEqual(roleRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/roles',
    })
    expectJsonBody(fetchMock, 0, roleCreateInput)
  })

  it('sends role update input and parses the updated role', async () => {
    const fetchMock = createFetchMock(jsonResponse(updatedRoleRequestResponse))

    await expect(updateRole(roleRequestId, roleUpdateInput)).resolves.toEqual(
      updatedRoleRequestResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: `/api/system/roles/${roleRequestId}`,
    })
    expectJsonBody(fetchMock, 0, roleUpdateInput)
  })

  it('parses a role detail response', async () => {
    const fetchMock = createFetchMock(jsonResponse(updatedRoleRequestResponse))

    await expect(getRole(roleRequestId)).resolves.toEqual(updatedRoleRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/system/roles/${roleRequestId}`,
    })
  })

  it('deletes a role with an empty response', async () => {
    const fetchMock = createFetchMock(emptyResponse())

    await expect(deleteRole(roleRequestId)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/system/roles/${roleRequestId}`,
    })
  })
})
