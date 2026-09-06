import { beforeEach, describe, expect, it } from 'vitest'
import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
} from '@rev30/contracts'
import {
  createResource,
  deleteResource,
  getResource,
  getResourceTree,
  getResourceTreeOptions,
  updateResource,
} from '../../../src/features/resources/requests'
import { useAuthStore } from '../../../src/stores/auth'
import {
  createFetchMock,
  emptyResponse,
  expectFetchCall,
  expectJsonBody,
  jsonResponse,
} from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const resourceRequestId = '44444444-4444-4444-8444-444444444444'

const resourceRequestResponse = {
  id: resourceRequestId,
  parentId: null,
  type: RESOURCE_TYPE_DIRECTORY,
  name: '系统管理',
  code: 'system',
  path: null,
  externalUrl: null,
  openTarget: RESOURCE_OPEN_TARGET_SELF,
  icon: 'lucide:settings',
  hidden: false,
  status: RESOURCE_STATUS_ENABLED,
  sortOrder: 1,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

const updatedResourceRequestResponse = {
  ...resourceRequestResponse,
  name: '权限资源',
  code: 'system:resource',
  updatedAt: '2026-05-02T00:00:00.000Z',
}

const resourceCreateInput = {
  type: RESOURCE_TYPE_DIRECTORY,
  name: '系统管理',
  code: 'system',
  parentId: null,
  path: null,
  externalUrl: null,
  openTarget: RESOURCE_OPEN_TARGET_SELF,
  icon: 'lucide:settings',
  hidden: false,
  status: RESOURCE_STATUS_ENABLED,
  sortOrder: 1,
} satisfies Parameters<typeof createResource>[0]

const resourceUpdateInput = {
  name: '权限资源',
  code: 'system:resource',
} satisfies Parameters<typeof updateResource>[1]

beforeEach(() => {
  createTestPinia()
})

describe('resources request helpers', () => {
  it('parses resource tree options responses from the resource tree options endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '55555555-5555-4555-8555-555555555555',
          parentId: null,
          type: RESOURCE_TYPE_MENU,
          name: '系统用户',
          code: 'system.users',
          status: RESOURCE_STATUS_ENABLED,
          children: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              parentId: '55555555-5555-4555-8555-555555555555',
              type: RESOURCE_TYPE_MENU,
              name: '用户管理',
              code: 'system.users.list',
              status: RESOURCE_STATUS_ENABLED,
              children: [],
            },
          ],
        },
      ]),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await getResourceTreeOptions(['55555555-5555-4555-8555-555555555555'])

    expect(result[0]?.children[0]?.code).toBe('system.users.list')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/resources/options/tree',
      query: {
        includeIds: '55555555-5555-4555-8555-555555555555',
      },
    })
  })

  it('parses resource tree responses from the system resources endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '44444444-4444-4444-8444-444444444444',
          parentId: null,
          type: RESOURCE_TYPE_MENU,
          name: '系统用户',
          code: 'system.users',
          path: '/system/users',
          externalUrl: null,
          openTarget: 'self',
          icon: null,
          hidden: false,
          status: RESOURCE_STATUS_ENABLED,
          sortOrder: 1,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
          children: [],
        },
      ]),
    )
    useAuthStore().accessToken = 'access-token'

    const result = await getResourceTree()

    expect(result[0]?.path).toBe('/system/users')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/resources/tree',
    })
  })

  it('parses a resource detail response', async () => {
    const fetchMock = createFetchMock(jsonResponse(resourceRequestResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(getResource(resourceRequestId)).resolves.toEqual(resourceRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/system/resources/${resourceRequestId}`,
    })
  })

  it('sends resource create input and parses the created resource', async () => {
    const fetchMock = createFetchMock(jsonResponse(resourceRequestResponse, { status: 201 }))
    useAuthStore().accessToken = 'access-token'

    await expect(createResource(resourceCreateInput)).resolves.toEqual(resourceRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/resources',
    })
    expectJsonBody(fetchMock, 0, resourceCreateInput)
  })

  it('sends resource update input and parses the updated resource', async () => {
    const fetchMock = createFetchMock(jsonResponse(updatedResourceRequestResponse))
    useAuthStore().accessToken = 'access-token'

    await expect(updateResource(resourceRequestId, resourceUpdateInput)).resolves.toEqual(
      updatedResourceRequestResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: `/api/system/resources/${resourceRequestId}`,
    })
    expectJsonBody(fetchMock, 0, resourceUpdateInput)
  })

  it('deletes a resource with an empty response', async () => {
    const fetchMock = createFetchMock(emptyResponse())
    useAuthStore().accessToken = 'access-token'

    await expect(deleteResource(resourceRequestId)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/system/resources/${resourceRequestId}`,
    })
  })
})
