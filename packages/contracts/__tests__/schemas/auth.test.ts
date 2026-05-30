import { describe, expect, it } from 'vitest'
import { USER_STATUS_ENABLED } from '../../src/system/users'
import {
  authLoginSchema,
  authPasswordUpdateSchema,
  authProfileUpdateSchema,
  authTokenResponseSchema,
} from '../../src/auth'
import { prettifyZodError } from '../helpers/schema'

describe('auth schemas', () => {
  it('parses short login passwords without enforcing password policy', () => {
    expect(
      authLoginSchema.parse({
        username: 'ada',
        password: 'short',
      }),
    ).toEqual({
      username: 'ada',
      password: 'short',
    })
  })

  it('rejects blank login passwords with a schema message', () => {
    const result = authLoginSchema.safeParse({
      username: 'ada',
      password: '   ',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('请输入密码')
    }
  })

  it('rejects blank login usernames with a schema message', () => {
    const result = authLoginSchema.safeParse({
      username: '   ',
      password: 'secret-password',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('请输入用户名')
    }
  })

  it('parses username and password login input', () => {
    expect(
      authLoginSchema.parse({
        username: ' ada ',
        password: ' secret-password ',
      }),
    ).toEqual({
      username: 'ada',
      password: ' secret-password ',
    })
  })

  it('parses token response with current user payload without exposing refresh tokens', () => {
    const response = authTokenResponseSchema.parse({
      user: {
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        nickname: 'Ada Lovelace',
        avatarId: null,
        email: null,
        phone: null,
        builtIn: false,
        departments: [],
        roles: [],
        status: USER_STATUS_ENABLED,
        createdAt: '2026-04-30T00:00:00.000Z',
        updatedAt: '2026-04-30T00:00:00.000Z',
      },
      accessCodes: ['system', 'system:user', 'system:user:list'],
      menus: [
        {
          id: '69b8cf85-bf4f-40d2-85da-3e80d30dbb00',
          parentId: null,
          type: 'directory',
          name: 'System',
          code: 'system',
          path: null,
          externalUrl: null,
          openTarget: 'self',
          icon: 'lucide:settings',
          hidden: false,
          status: 1,
          sortOrder: 0,
          createdAt: '2026-05-04T08:00:00.000Z',
          updatedAt: '2026-05-04T08:00:00.000Z',
          children: [],
        },
      ],
      accessToken: 'access.jwt',
      refreshToken: 'refresh.jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
    })

    expect(response).toMatchObject({
      accessToken: 'access.jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
    })
    expect(response.accessCodes).toEqual(['system', 'system:user', 'system:user:list'])
    expect(response.menus).toHaveLength(1)
    expect(response).not.toHaveProperty('refreshToken')
  })

  it('parses current user profile updates without username', () => {
    const avatarId = '6a4e9b86-e4ce-43d7-89f8-49ad0c3f92c4'
    const result = authProfileUpdateSchema.parse({
      nickname: 'Ada',
      avatarId,
      email: '',
      phone: '13800138000',
    })

    expect(result).toEqual({
      nickname: 'Ada',
      avatarId,
      email: null,
      phone: '13800138000',
    })
    expect(() =>
      authProfileUpdateSchema.parse({
        username: 'ada',
        nickname: 'Ada',
        avatarId: null,
        email: null,
        phone: null,
      }),
    ).toThrow()
  })

  it('parses password update requests', () => {
    expect(
      authPasswordUpdateSchema.parse({
        currentPassword: 'old-secret',
        newPassword: 'new-secret',
      }),
    ).toEqual({
      currentPassword: 'old-secret',
      newPassword: 'new-secret',
    })
  })
})
