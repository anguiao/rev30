import { beforeEach, describe, expect, it } from 'vitest'
import { USER_STATUS_ENABLED } from '@rev30/contracts'
import {
  deleteUser,
  createUser,
  getUser,
  getUserOptions,
  resetUserPassword,
  listUsers,
  updateUser,
} from '../../../src/features/users/requests'
import { useAuthStore } from '../../../src/stores/auth'
import {
  createFetchMock,
  emptyResponse,
  expectFetchCall,
  expectJsonBody,
  jsonResponse,
} from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const userCreateInput = {
  avatarId: null,
  username: 'ada',
  nickname: 'Ada',
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  departmentIds: [],
  roleIds: [],
} satisfies Parameters<typeof createUser>[0]

const userRequestId = '22222222-2222-2222-8222-222222222222'

const userRequestResponse = {
  id: userRequestId,
  username: 'ada',
  nickname: 'Ada',
  avatarId: null,
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  builtIn: false,
  departments: [],
  roles: [],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

const updatedUserRequestResponse = {
  ...userRequestResponse,
  nickname: 'Ada Lovelace',
  email: 'ada@example.com',
  updatedAt: '2026-05-02T00:00:00.000Z',
}

const userUpdateInput = {
  avatarId: null,
  username: 'ada',
  nickname: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: null,
  status: USER_STATUS_ENABLED,
  departmentIds: [],
  roleIds: [],
} satisfies Parameters<typeof updateUser>[1]

beforeEach(() => {
  createTestPinia()
  useAuthStore().accessToken = 'access-token'
})

describe('users request helpers', () => {
  it('parses list responses from the system users endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
      }),
    )

    const result = await listUsers({
      page: 1,
      pageSize: 20,
      keyword: 'ada',
      status: USER_STATUS_ENABLED,
    })

    expect(result.total).toBe(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/users',
      query: {
        page: '1',
        pageSize: '20',
        keyword: 'ada',
        status: '1',
      },
    })
  })

  it('omits empty query values before sending requests', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
      }),
    )

    await listUsers({
      page: 1,
      pageSize: 20,
      keyword: '',
      status: USER_STATUS_ENABLED,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/users',
      query: {
        page: '1',
        pageSize: '20',
        keyword: undefined,
        status: '1',
      },
    })
  })

  it('parses user options responses from the users options endpoint', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          id: '11111111-1111-4111-8111-111111111111',
          username: 'alice',
          nickname: 'Alice',
          status: USER_STATUS_ENABLED,
        },
      ]),
    )

    const result = await getUserOptions(['11111111-1111-4111-8111-111111111111'])

    expect(result[0]?.username).toBe('alice')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/users/options',
      query: {
        includeIds: '11111111-1111-4111-8111-111111111111',
      },
    })
  })

  it('omits includeIds when empty for user options requests', async () => {
    const fetchMock = createFetchMock(jsonResponse([]))

    await getUserOptions([])

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/users/options',
      query: {
        includeIds: undefined,
      },
    })
  })

  it('parses create user responses and temporary passwords', async () => {
    const responseBody = {
      user: {
        id: '22222222-2222-4222-8222-222222222222',
        username: 'ada',
        nickname: 'Ada',
        avatarId: null,
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        builtIn: false,
        departments: [],
        roles: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      temporaryPassword: 'temp-pwd-001',
    }
    const fetchMock = createFetchMock(jsonResponse(responseBody))

    const result = await createUser(userCreateInput)

    expect(result).toEqual(responseBody)
    expect(result.temporaryPassword).toBe('temp-pwd-001')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/users',
    })
    expectJsonBody(fetchMock, 0, userCreateInput)
  })

  it('rejects malformed create user responses with invalid temporaryPassword length', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        user: {
          id: '22222222-2222-4222-8222-222222222222',
          username: 'ada',
          nickname: 'Ada',
          avatarId: null,
          email: null,
          phone: null,
          status: USER_STATUS_ENABLED,
          builtIn: false,
          departments: [],
          roles: [],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        temporaryPassword: 'short',
      }),
    )

    await expect(createUser(userCreateInput)).rejects.toThrow()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/users',
    })
    expectJsonBody(fetchMock, 0, userCreateInput)
  })

  it('parses reset user password responses and returns temporary passwords', async () => {
    const responseBody = {
      userId: '33333333-3333-4333-8333-333333333333',
      temporaryPassword: 'temp-reset-001',
    }
    const fetchMock = createFetchMock(jsonResponse(responseBody))

    const result = await resetUserPassword('33333333-3333-4333-8333-333333333333')

    expect(result.temporaryPassword).toBe('temp-reset-001')
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/users/33333333-3333-4333-8333-333333333333/password/reset',
    })
  })

  it('rejects malformed reset user password responses with invalid temporaryPassword', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        userId: '33333333-3333-4333-8333-333333333333',
        temporaryPassword: 'short',
      }),
    )

    await expect(resetUserPassword('33333333-3333-4333-8333-333333333333')).rejects.toThrow()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/system/users/33333333-3333-4333-8333-333333333333/password/reset',
    })
  })

  it('parses a user detail response', async () => {
    const fetchMock = createFetchMock(jsonResponse(userRequestResponse))

    await expect(getUser(userRequestId)).resolves.toEqual(userRequestResponse)

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/system/users/${userRequestId}`,
    })
  })

  it('sends user update input and parses the updated user', async () => {
    const fetchMock = createFetchMock(jsonResponse(updatedUserRequestResponse))

    await expect(updateUser(userRequestId, userUpdateInput)).resolves.toEqual(
      updatedUserRequestResponse,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: `/api/system/users/${userRequestId}`,
    })
    expectJsonBody(fetchMock, 0, userUpdateInput)
  })

  it('deletes a user with an empty response', async () => {
    const fetchMock = createFetchMock(emptyResponse())

    await expect(deleteUser(userRequestId)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/system/users/${userRequestId}`,
    })
  })
})
