import { describe, expect, it } from 'vitest'
import {
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
  roleCreateSchema,
  roleListItemSchema,
  roleListQuerySchema,
  roleListResponseSchema,
  roleResourceSchema,
  roleSchema,
  roleUpdateSchema,
} from '../../../src/schemas/system/roles'
import { RESOURCE_TYPE_ACTION, RESOURCE_TYPE_MENU } from '../../../src/schemas/system/resources'

function firstIssueMessage(result: { success: false; error: { issues: { message: string }[] } }) {
  return result.error.issues[0]?.message
}

describe('role schemas', () => {
  it('accepts role list items with user counts and no resources', () => {
    expect(
      roleListItemSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        name: 'Administrator',
        code: 'admin',
        status: ROLE_STATUS_ENABLED,
        sortOrder: 10,
        userCount: 2,
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
      }),
    ).toMatchObject({
      code: 'admin',
      userCount: 2,
    })
  })

  it('accepts role details with resource summaries', () => {
    expect(
      roleSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        name: 'Administrator',
        code: 'admin',
        status: ROLE_STATUS_ENABLED,
        sortOrder: 10,
        resources: [
          {
            id: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
            name: 'Users',
            code: 'system:user',
            type: RESOURCE_TYPE_MENU,
          },
          {
            id: '875dd9cb-488b-43d7-a55f-6db070a8e83f',
            name: 'Create User',
            code: 'system:user:create',
            type: RESOURCE_TYPE_ACTION,
          },
        ],
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
      }),
    ).toMatchObject({
      code: 'admin',
      resources: [{ code: 'system:user' }, { code: 'system:user:create' }],
    })
  })

  it('accepts role resource summaries', () => {
    expect(
      roleResourceSchema.parse({
        id: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
        name: 'Users',
        code: 'system:user',
        type: RESOURCE_TYPE_MENU,
      }),
    ).toEqual({
      id: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
      name: 'Users',
      code: 'system:user',
      type: RESOURCE_TYPE_MENU,
    })
  })

  it('defaults new roles to enabled with zero sort order', () => {
    expect(
      roleCreateSchema.parse({
        name: 'Operator',
        code: 'operator',
      }),
    ).toEqual({
      name: 'Operator',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('accepts unique resource ids on create and update input', () => {
    const firstResourceId = '4be2dfda-2fd6-4ee5-b06b-c551328bc343'
    const secondResourceId = '875dd9cb-488b-43d7-a55f-6db070a8e83f'

    expect(
      roleCreateSchema.parse({
        name: 'Administrator',
        code: 'admin',
        resourceIds: [firstResourceId, secondResourceId],
      }),
    ).toEqual({
      name: 'Administrator',
      code: 'admin',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 0,
      resourceIds: [firstResourceId, secondResourceId],
    })

    expect(roleUpdateSchema.parse({ resourceIds: [] })).toEqual({
      resourceIds: [],
    })
  })

  it('rejects duplicate resource ids on role input', () => {
    const resourceId = '4be2dfda-2fd6-4ee5-b06b-c551328bc343'
    const result = roleCreateSchema.safeParse({
      name: 'Administrator',
      code: 'admin',
      resourceIds: [resourceId, resourceId],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('资源不能重复')
    }
  })

  it('requires at least one role update field', () => {
    const result = roleUpdateSchema.safeParse({})

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('至少修改一个字段')
    }
  })

  it('parses role list query strings into pagination and filters', () => {
    expect(
      roleListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        keyword: ' admin ',
        status: '0',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      keyword: 'admin',
      status: ROLE_STATUS_DISABLED,
    })
  })

  it('accepts role list responses', () => {
    expect(
      roleListResponseSchema.parse({
        list: [
          {
            id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
            name: 'Administrator',
            code: 'admin',
            status: ROLE_STATUS_ENABLED,
            sortOrder: 10,
            userCount: 2,
            createdAt: '2026-05-04T08:00:00.000Z',
            updatedAt: '2026-05-04T08:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toMatchObject({
      total: 1,
      list: [{ code: 'admin', userCount: 2 }],
    })
  })
})
