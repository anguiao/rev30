import { describe, expect, it } from 'vitest'
import {
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  systemUserCreateSchema,
  systemUserListQuerySchema,
  systemUserUpdateSchema,
  systemUserSchema,
} from './user'

describe('system user schemas', () => {
  it('accepts a user response with nullable email and phone', () => {
    expect(
      systemUserSchema.parse({
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
      systemUserCreateSchema.parse({
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
      systemUserCreateSchema.parse({
        username: 'alan',
        nickname: 'Alan Turing',
        status: USER_STATUS_DISABLED,
      }),
    ).toMatchObject({
      status: USER_STATUS_DISABLED,
    })

    expect(() =>
      systemUserCreateSchema.parse({
        username: 'invalid',
        nickname: 'Invalid User',
        status: 2,
      }),
    ).toThrow()
  })

  it('parses list query strings into pagination and status values', () => {
    expect(
      systemUserListQuerySchema.parse({
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
    expect(systemUserListQuerySchema.parse({ status: '' })).toEqual({
      page: 1,
      pageSize: 20,
    })

    expect(systemUserListQuerySchema.parse({ status: '   ' })).toEqual({
      page: 1,
      pageSize: 20,
    })
  })

  it('requires at least one field for updates', () => {
    expect(() => systemUserUpdateSchema.parse({})).toThrow()
    expect(() => systemUserUpdateSchema.parse({ email: undefined })).toThrow()
    expect(() => systemUserUpdateSchema.parse({ status: undefined })).toThrow()
    expect(systemUserUpdateSchema.parse({ phone: null })).toEqual({ phone: null })
  })
})
