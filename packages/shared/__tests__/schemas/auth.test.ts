import { describe, expect, it } from 'vitest'
import { USER_STATUS_ENABLED } from '../../src/schemas/system/users'
import {
  authLoginSchema,
  authErrorResponseSchema,
  authRegisterSchema,
  authTokenResponseSchema,
} from '../../src/schemas/auth'

function firstIssueMessage(result: { success: false; error: { issues: { message: string }[] } }) {
  return result.error.issues[0]?.message
}

describe('auth schemas', () => {
  it('parses public registration input without allowing status', () => {
    expect(
      authRegisterSchema.parse({
        username: 'ada',
        password: 'correct horse battery staple',
        nickname: 'Ada Lovelace',
        email: '',
        phone: '',
      }),
    ).toEqual({
      username: 'ada',
      password: 'correct horse battery staple',
      nickname: 'Ada Lovelace',
      email: null,
      phone: null,
    })

    expect(() =>
      authRegisterSchema.parse({
        username: 'ada',
        password: 'correct horse battery staple',
        nickname: 'Ada Lovelace',
        status: 0,
      }),
    ).toThrow()
  })

  it('defaults omitted registration contact fields to null', () => {
    expect(
      authRegisterSchema.parse({
        username: 'ada',
        password: 'correct horse battery staple',
        nickname: 'Ada Lovelace',
      }),
    ).toEqual({
      username: 'ada',
      password: 'correct horse battery staple',
      nickname: 'Ada Lovelace',
      email: null,
      phone: null,
    })
  })

  it('rejects weak registration passwords', () => {
    const result = authRegisterSchema.safeParse({
      username: 'ada',
      password: 'short',
      nickname: 'Ada Lovelace',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('密码至少需要 8 位')
    }
  })

  it('rejects weak login passwords', () => {
    const result = authLoginSchema.safeParse({
      username: 'ada',
      password: 'short',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('密码至少需要 8 位')
    }
  })

  it('rejects blank login usernames with a schema message', () => {
    const result = authLoginSchema.safeParse({
      username: '   ',
      password: 'secret-password',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('请输入用户名')
    }
  })

  it('parses username and password login input', () => {
    expect(
      authLoginSchema.parse({
        username: ' ada ',
        password: 'secret-password',
      }),
    ).toEqual({
      username: 'ada',
      password: 'secret-password',
    })
  })

  it('parses token response with current user payload without exposing refresh tokens', () => {
    const response = authTokenResponseSchema.parse({
      user: {
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        nickname: 'Ada Lovelace',
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        createdAt: '2026-04-30T00:00:00.000Z',
        updatedAt: '2026-04-30T00:00:00.000Z',
      },
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
    expect(response).not.toHaveProperty('refreshToken')
  })

  it('parses auth errors with optional unique user fields', () => {
    expect(
      authErrorResponseSchema.parse({
        field: 'username',
        message: '用户名已存在',
      }),
    ).toEqual({
      field: 'username',
      message: '用户名已存在',
    })

    expect(() =>
      authErrorResponseSchema.parse({
        field: 'role',
        message: 'role is not unique',
      }),
    ).toThrow()
  })
})
