import { describe, expect, it } from 'vitest'
import { USER_STATUS_ENABLED } from './user'
import {
  authLoginSchema,
  authLogoutSchema,
  authRefreshSchema,
  authRegisterSchema,
  authTokenResponseSchema,
} from './auth'

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

  it('parses username and password login input', () => {
    expect(
      authLoginSchema.parse({
        username: ' ada ',
        password: 'secret',
      }),
    ).toEqual({
      username: 'ada',
      password: 'secret',
    })
  })

  it('accepts refresh and logout with optional refresh token', () => {
    expect(authRefreshSchema.parse({})).toEqual({})
    expect(authRefreshSchema.parse({ refreshToken: ' token ' })).toEqual({
      refreshToken: 'token',
    })
    expect(authLogoutSchema.parse({})).toEqual({})
    expect(authLogoutSchema.parse({ refreshToken: ' token ' })).toEqual({
      refreshToken: 'token',
    })
  })

  it('parses token response with current user payload', () => {
    expect(
      authTokenResponseSchema.parse({
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
      }),
    ).toMatchObject({
      accessToken: 'access.jwt',
      refreshToken: 'refresh.jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
    })
  })
})
