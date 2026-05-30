import { describe, expect, it } from 'vitest'
import {
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  userCreateSchema,
  userOptionSchema,
  userOptionsQuerySchema,
  userOptionsResponseSchema,
  userCreateResponseSchema,
  userResetPasswordResponseSchema,
  userListQuerySchema,
  userUpdateSchema,
  userSchema,
} from '../../../src'
import { prettifyZodError, testUuid } from '../../helpers/schema'

describe('user schemas', () => {
  it('parses includeIds as comma-separated user ids and deduplicates values', () => {
    const first = '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7'
    const second = '4be2dfda-2fd6-4ee5-b06b-c551328bc343'

    expect(userOptionsQuerySchema.parse({ includeIds: `${first}, ${second}, ${first}` })).toEqual({
      includeIds: [first, second],
    })
  })

  it('parses includeIds as empty array for blank strings or non-string values', () => {
    expect(userOptionsQuerySchema.parse({ includeIds: '' })).toEqual({ includeIds: [] })
    expect(userOptionsQuerySchema.parse({ includeIds: '   ' })).toEqual({ includeIds: [] })
    expect(userOptionsQuerySchema.parse({ includeIds: {} })).toEqual({ includeIds: [] })
  })

  it('parses includeIds query with empty object as []', () => {
    expect(userOptionsQuerySchema.parse({})).toEqual({ includeIds: [] })
  })

  it('reports invalid user id in includeIds query', () => {
    const result = userOptionsQuerySchema.safeParse({
      includeIds: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7, invalid-uuid',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('用户 ID 无效')
    }
  })

  it('accepts lightweight user options response', () => {
    expect(
      userOptionsResponseSchema.parse([
        {
          id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
          username: 'ada',
          nickname: 'Ada Lovelace',
          status: USER_STATUS_ENABLED,
        },
      ]),
    ).toMatchObject([
      {
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        nickname: 'Ada Lovelace',
        status: USER_STATUS_ENABLED,
      },
    ])
  })

  it('accepts nullable avatar ids in user responses and inputs', () => {
    const avatarId = '6a4e9b86-e4ce-43d7-89f8-49ad0c3f92c4'

    expect(
      userSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        nickname: 'Ada Lovelace',
        avatarId,
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        builtIn: false,
        departments: [],
        roles: [],
        createdAt: '2026-05-30T00:00:00.000Z',
        updatedAt: '2026-05-30T00:00:00.000Z',
      }),
    ).toMatchObject({ avatarId })

    expect(
      userCreateSchema.parse({
        username: 'grace',
        nickname: 'Grace Hopper',
        avatarId,
      }),
    ).toMatchObject({
      username: 'grace',
      nickname: 'Grace Hopper',
      avatarId,
      status: USER_STATUS_ENABLED,
    })

    expect(
      userCreateSchema.parse({
        username: 'no-avatar',
        nickname: 'No Avatar',
      }),
    ).toMatchObject({
      avatarId: null,
    })

    expect(userUpdateSchema.parse({ avatarId: null })).toEqual({ avatarId: null })
  })

  it('parses user options with field selection', () => {
    const result = userOptionSchema.safeParse({
      id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      username: 'ada',
      nickname: 'Ada Lovelace',
      status: USER_STATUS_ENABLED,
    })

    expect(result.success).toBe(true)
  })

  it('accepts a user response with nullable email and phone', () => {
    expect(
      userSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        nickname: 'Ada Lovelace',
        avatarId: null,
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        builtIn: false,
        departments: [],
        roles: [],
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

  it('requires user responses to include department summaries', () => {
    expect(
      userSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        nickname: 'Ada Lovelace',
        avatarId: null,
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        builtIn: false,
        departments: [
          {
            id: '7a4f8d8c-7f20-4d3c-9d8e-5b2ca8b6b8d1',
            name: 'Engineering',
            code: 'engineering',
          },
        ],
        roles: [],
        createdAt: '2026-04-29T08:00:00.000Z',
        updatedAt: '2026-04-29T08:00:00.000Z',
      }),
    ).toMatchObject({
      departments: [
        {
          id: '7a4f8d8c-7f20-4d3c-9d8e-5b2ca8b6b8d1',
          name: 'Engineering',
          code: 'engineering',
        },
      ],
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
      avatarId: null,
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
      expect(prettifyZodError(result)).toContain('用户状态无效')
    }
  })

  it('parses list query strings into pagination and status values', () => {
    const departmentId = '4be2dfda-2fd6-4ee5-b06b-c551328bc343'
    const roleId = '875dd9cb-488b-43d7-a55f-6db070a8e83f'

    expect(
      userListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        keyword: ' ada ',
        status: '0',
        departmentId,
        roleId,
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      keyword: 'ada',
      status: USER_STATUS_DISABLED,
      departmentId,
      roleId,
    })
  })

  it('treats blank list query status as undefined', () => {
    expect(userListQuerySchema.parse({ status: '', departmentId: '', roleId: '   ' })).toEqual({
      page: 1,
      pageSize: 20,
    })

    expect(userListQuerySchema.parse({ status: '   ' })).toEqual({
      page: 1,
      pageSize: 20,
    })
  })

  it('reports invalid list relation filter ids', () => {
    const result = userListQuerySchema.safeParse({
      departmentId: 'not-a-uuid',
      roleId: 'also-invalid',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const message = prettifyZodError(result)

      expect(message).toContain('部门 ID 无效')
      expect(message).toContain('角色 ID 无效')
    }
  })

  it('requires at least one field for updates', () => {
    for (const input of [{}, { email: undefined }, { status: undefined }]) {
      const result = userUpdateSchema.safeParse(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(prettifyZodError(result)).toContain('至少修改一个字段')
      }
    }

    expect(userUpdateSchema.parse({ phone: null })).toEqual({ phone: null })
  })

  it('accepts unique department ids on create and update input', () => {
    const firstDepartmentId = 'a89d9bf8-8d13-45f4-a1de-3f4adfd4b8d1'
    const secondDepartmentId = 'c3b4f5ab-2e4d-48ea-9a65-5e2d6b0f9f7d'

    expect(
      userCreateSchema.parse({
        username: 'grace',
        nickname: 'Grace Hopper',
        departmentIds: [firstDepartmentId, secondDepartmentId],
      }),
    ).toEqual({
      username: 'grace',
      nickname: 'Grace Hopper',
      avatarId: null,
      status: USER_STATUS_ENABLED,
      departmentIds: [firstDepartmentId, secondDepartmentId],
    })

    expect(userUpdateSchema.parse({ departmentIds: [] })).toEqual({
      departmentIds: [],
    })
  })

  it('rejects duplicate department ids on user input', () => {
    const duplicateDepartmentId = 'd0db3e95-4bc8-44a9-b0ce-0f5b7a7f3f5b'

    const result = userCreateSchema.safeParse({
      username: 'grace',
      nickname: 'Grace Hopper',
      departmentIds: [duplicateDepartmentId, duplicateDepartmentId],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('部门不能重复')
    }
  })

  it('rejects excessive department ids on user input', () => {
    const result = userCreateSchema.safeParse({
      username: 'grace',
      nickname: 'Grace Hopper',
      departmentIds: Array.from({ length: 51 }, (_, index) => testUuid(index + 1)),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('用户部门不能超过 50 个')
    }
  })

  it('reports schema messages for invalid user input fields', () => {
    const invalidUser = userSchema.safeParse({
      id: 'not-a-uuid',
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: null,
      phone: null,
      builtIn: false,
      departments: [],
      roles: [],
      status: USER_STATUS_ENABLED,
      createdAt: '2026-04-29T08:00:00.000Z',
      updatedAt: '2026-04-29T08:00:00.000Z',
    })

    expect(invalidUser.success).toBe(false)
    if (!invalidUser.success) {
      expect(prettifyZodError(invalidUser)).toContain('用户 ID 无效')
    }

    const invalidQuery = userListQuerySchema.safeParse({
      page: '0',
    })

    expect(invalidQuery.success).toBe(false)
    if (!invalidQuery.success) {
      expect(prettifyZodError(invalidQuery)).toContain('页码不能小于 1')
    }
  })

  it('requires user responses to include role summaries', () => {
    expect(
      userSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        nickname: 'Ada Lovelace',
        avatarId: null,
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        builtIn: false,
        departments: [],
        roles: [
          {
            id: '875dd9cb-488b-43d7-a55f-6db070a8e83f',
            name: 'Administrator',
            code: 'admin',
          },
        ],
        createdAt: '2026-04-29T08:00:00.000Z',
        updatedAt: '2026-04-29T08:00:00.000Z',
      }),
    ).toMatchObject({
      roles: [
        {
          id: '875dd9cb-488b-43d7-a55f-6db070a8e83f',
          name: 'Administrator',
          code: 'admin',
        },
      ],
    })
  })

  it('accepts unique role ids on create and update input', () => {
    const firstRoleId = '4be2dfda-2fd6-4ee5-b06b-c551328bc343'
    const secondRoleId = '875dd9cb-488b-43d7-a55f-6db070a8e83f'

    expect(
      userCreateSchema.parse({
        username: 'grace',
        nickname: 'Grace Hopper',
        roleIds: [firstRoleId, secondRoleId],
      }),
    ).toEqual({
      username: 'grace',
      nickname: 'Grace Hopper',
      avatarId: null,
      status: USER_STATUS_ENABLED,
      roleIds: [firstRoleId, secondRoleId],
    })

    expect(userUpdateSchema.parse({ roleIds: [] })).toEqual({
      roleIds: [],
    })
  })

  it('rejects duplicate role ids on user input', () => {
    const duplicateRoleId = 'd0db3e95-4bc8-44a9-b0ce-0f5b7a7f3f5b'

    const result = userCreateSchema.safeParse({
      username: 'grace',
      nickname: 'Grace Hopper',
      roleIds: [duplicateRoleId, duplicateRoleId],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('角色不能重复')
    }
  })

  it('rejects excessive role ids on user input', () => {
    const result = userCreateSchema.safeParse({
      username: 'grace',
      nickname: 'Grace Hopper',
      roleIds: Array.from({ length: 51 }, (_, index) => testUuid(index + 1)),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('用户角色不能超过 50 个')
    }
  })

  it('parses user create responses with a one-time temporary password', () => {
    const result = userCreateResponseSchema.parse({
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        username: 'grace',
        nickname: 'Grace Hopper',
        avatarId: null,
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        builtIn: false,
        departments: [],
        roles: [],
        createdAt: '2026-05-08T00:00:00.000Z',
        updatedAt: '2026-05-08T00:00:00.000Z',
      },
      temporaryPassword: 'generated-password',
    })

    expect(result.temporaryPassword).toBe('generated-password')
    expect(result.user.username).toBe('grace')
  })

  it('parses user reset password responses', () => {
    expect(
      userResetPasswordResponseSchema.parse({
        userId: '11111111-1111-4111-8111-111111111111',
        temporaryPassword: 'new-password',
      }),
    ).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      temporaryPassword: 'new-password',
    })
  })
})
