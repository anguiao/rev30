import { beforeEach, describe, expect, it } from 'vitest'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import {
  AuthRequestError,
  getAuthErrorMessage,
  logout,
  parseAuthError,
  updateMyPassword,
  updateMyProfile,
} from '../../../src/features/auth/requests'
import {
  createFetchMock,
  emptyResponse,
  expectFetchCall,
  expectJsonBody,
  jsonResponse,
} from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

describe('auth requests', () => {
  beforeEach(() => {
    createTestPinia()
  })

  it('maps auth error responses to a typed error', async () => {
    await expect(
      parseAuthError(
        new Response(JSON.stringify({ field: 'username', message: 'username already exists' }), {
          status: 409,
        }),
      ),
    ).resolves.toMatchObject({
      status: 409,
      field: 'username',
      message: 'username already exists',
    })
  })

  it('falls back when auth error responses violate the shared schema', async () => {
    await expect(
      parseAuthError(
        new Response(JSON.stringify({ field: 123, message: 123 }), {
          status: 409,
        }),
      ),
    ).resolves.toMatchObject({
      status: 409,
      message: '请求失败',
      field: undefined,
    })
  })

  it('keeps a stable message when the server response is not json', async () => {
    await expect(parseAuthError(new Response('nope', { status: 500 }))).resolves.toMatchObject({
      status: 500,
      message: '请求失败',
    })
  })

  it('exposes status and field on AuthRequestError', () => {
    const error = new AuthRequestError(401, 'Invalid username or password')

    expect(error.status).toBe(401)
    expect(error.message).toBe('Invalid username or password')
    expect(error.field).toBeUndefined()
  })

  it('logs out through the Hono RPC client', async () => {
    const fetchMock = createFetchMock(emptyResponse())

    await logout()

    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/auth/logout',
    })
  })

  it('updates my profile through the Hono RPC client with provided input', async () => {
    const responseBody = {
      id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '18888888888',
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
      }),
    ).rejects.toThrow()
  })

  it('updates my password through the Hono RPC client with provided input', async () => {
    const fetchMock = createFetchMock(emptyResponse())

    const result = await updateMyPassword({
      currentPassword: 'password123',
      newPassword: 'password456',
    })

    expect(result).toBeUndefined()
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

  it('reuses parseAuthError for profile and password request failures', async () => {
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

  it('extracts auth error messages and falls back for unknown errors', async () => {
    expect(getAuthErrorMessage(new AuthRequestError(401, '会话已过期'), '操作失败')).toBe(
      '会话已过期',
    )
    expect(getAuthErrorMessage(new Error('boom'), '操作失败')).toBe('操作失败')
  })
})
