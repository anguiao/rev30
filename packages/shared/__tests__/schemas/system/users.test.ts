import { describe, expect, it } from 'vitest'
import {
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  userCreateSchema,
  userListQuerySchema,
  userUpdateSchema,
  userSchema,
} from '../../../src/schemas/system/users'

describe('user schemas', () => {
  it('accepts a user response with nullable email and phone', () => {
    expect(
      userSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        nickname: 'Ada Lovelace',
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        createdAt: '2026-04-29T08:00:00.000Z',
        updatedAt: '2026-04-29T08:00:00.000Z',
      }),
    ).toMatchObject({
      username: 'ada',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
    })
  })

  it('defaults new users to enabled status', () => {
    expect(
      userCreateSchema.parse({
        username: 'grace',
        nickname: 'Grace Hopper',
      }),
    ).toEqual({
      username: 'grace',
      nickname: 'Grace Hopper',
      status: USER_STATUS_ENABLED,
    })
  })

  it('accepts disabled status but rejects unknown status values', () => {
    expect(
      userCreateSchema.parse({
        username: 'alan',
        nickname: 'Alan Turing',
        status: USER_STATUS_DISABLED,
      }),
    ).toMatchObject({
      status: USER_STATUS_DISABLED,
    })

    expect(() =>
      userCreateSchema.parse({
        username: 'invalid',
        nickname: 'Invalid User',
        status: 2,
      }),
    ).toThrow()
  })

  it('parses list query strings into pagination and status values', () => {
    expect(
      userListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        keyword: ' ada ',
        status: '0',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      keyword: 'ada',
      status: USER_STATUS_DISABLED,
    })
  })

  it('treats blank list query status as undefined', () => {
    expect(userListQuerySchema.parse({ status: '' })).toEqual({
      page: 1,
      pageSize: 20,
    })

    expect(userListQuerySchema.parse({ status: '   ' })).toEqual({
      page: 1,
      pageSize: 20,
    })
  })

  it('requires at least one field for updates', () => {
    expect(() => userUpdateSchema.parse({})).toThrow()
    expect(() => userUpdateSchema.parse({ email: undefined })).toThrow()
    expect(() => userUpdateSchema.parse({ status: undefined })).toThrow()
    expect(userUpdateSchema.parse({ phone: null })).toEqual({ phone: null })
  })
})
