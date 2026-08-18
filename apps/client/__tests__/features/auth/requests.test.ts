import { beforeEach, describe, expect, it } from 'vitest'
import { USER_STATUS_ENABLED, type AuthTokenResponse } from '@rev30/contracts'
import { logout, updateMyPassword, updateMyProfile } from '../../../src/features/auth/requests'
import { useAuthStore } from '../../../src/stores/auth'
import {
  createFetchMock,
  emptyResponse,
  expectFetchCall,
  expectJsonBody,
  getFetchCall,
  jsonResponse,
} from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

describe('auth requests', () => {
  beforeEach(() => {
    createTestPinia()
  })

  it('logs out through the Hono RPC client', async () => {
    const fetchMock = createFetchMock(emptyResponse())
    useAuthStore().accessToken = 'access-token'

    await logout()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/auth/logout',
    })
    expect(getFetchCall(fetchMock).headers.get('authorization')).toBe('Bearer access-token')
  })

  it('updates my profile through the Hono RPC client with provided input', async () => {
    const responseBody = {
      id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '18888888888',
      avatarId: null,
      status: USER_STATUS_ENABLED,
      builtIn: false,
      departments: [],
      roles: [],
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
    }

    const fetchMock = createFetchMock(jsonResponse(responseBody))

    const result = await updateMyProfile({
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '18888888888',
      avatarId: null,
    })

    expect(result).toEqual(responseBody)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: '/api/auth/me/profile',
    })
    expectJsonBody(fetchMock, 0, {
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '18888888888',
      avatarId: null,
    })
  })

  it('parses auth request errors for my profile updates', async () => {
    createFetchMock(
      jsonResponse(
        {
          field: 'nickname',
          message: '昵称过长',
        },
        {
          status: 400,
        },
      ),
    )

    await expect(
      updateMyProfile({
        nickname: 'Ada Lovelace',
        email: null,
        phone: null,
        avatarId: null,
      }),
    ).rejects.toMatchObject({
      status: 400,
      field: 'nickname',
      message: '昵称过长',
    })
  })

  it('rejects malformed update profile responses that do not match the User schema', async () => {
    createFetchMock(
      jsonResponse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        status: 'enabled',
        builtIn: false,
        departments: [],
        roles: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      }),
    )

    await expect(
      updateMyProfile({
        nickname: 'Ada Lovelace',
        email: null,
        phone: null,
        avatarId: null,
      }),
    ).rejects.toThrow()
  })

  it('updates my password through the Hono RPC client with provided input', async () => {
    const responseBody: AuthTokenResponse = {
      accessToken: 'new-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      accessCodes: [],
      menus: [],
      user: {
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        nickname: 'Ada Lovelace',
        email: null,
        phone: null,
        avatarId: null,
        status: USER_STATUS_ENABLED,
        builtIn: false,
        departments: [],
        roles: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
      },
    }
    const fetchMock = createFetchMock(jsonResponse(responseBody))

    const result = await updateMyPassword({
      currentPassword: 'password123',
      newPassword: 'password456',
    })

    expect(result).toEqual(responseBody)
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'PATCH',
      pathname: '/api/auth/me/password',
    })
    expectJsonBody(fetchMock, 0, {
      currentPassword: 'password123',
      newPassword: 'password456',
    })
  })

  it('rejects malformed password update responses that do not match the auth token schema', async () => {
    createFetchMock(jsonResponse({ accessToken: 'new-access-token' }))

    await expect(
      updateMyPassword({
        currentPassword: 'password123',
        newPassword: 'password456',
      }),
    ).rejects.toThrow()
  })

  it('maps password update failures to typed API errors', async () => {
    createFetchMock(
      jsonResponse(
        {
          message: '当前密码错误',
        },
        {
          status: 400,
        },
      ),
    )

    await expect(
      updateMyPassword({
        currentPassword: 'password123',
        newPassword: 'password456',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: '当前密码错误',
    })
  })
})
