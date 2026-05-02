import { describe, expect, it } from 'vitest'
import {
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  userCreateSchema,
  userListQuerySchema,
  userUpdateSchema,
  userSchema,
} from '../../../src/schemas/system/users'

function firstIssueMessage(result: { success: false; error: { issues: { message: string }[] } }) {
  return result.error.issues[0]?.message
}

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

    const result = userCreateSchema.safeParse({
      username: 'invalid',
      nickname: 'Invalid User',
      status: 2,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('用户状态无效')
    }
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
    for (const input of [{}, { email: undefined }, { status: undefined }]) {
      const result = userUpdateSchema.safeParse(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(firstIssueMessage(result)).toBe('至少修改一个字段')
      }
    }

    expect(userUpdateSchema.parse({ phone: null })).toEqual({ phone: null })
  })

  it('reports schema messages for invalid user input fields', () => {
    const invalidUser = userSchema.safeParse({
      id: 'not-a-uuid',
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      createdAt: '2026-04-29T08:00:00.000Z',
      updatedAt: '2026-04-29T08:00:00.000Z',
    })

    expect(invalidUser.success).toBe(false)
    if (!invalidUser.success) {
      expect(firstIssueMessage(invalidUser)).toBe('用户 ID 无效')
    }

    const invalidQuery = userListQuerySchema.safeParse({
      page: '0',
    })

    expect(invalidQuery.success).toBe(false)
    if (!invalidQuery.success) {
      expect(firstIssueMessage(invalidQuery)).toBe('页码不能小于 1')
    }
  })
})
