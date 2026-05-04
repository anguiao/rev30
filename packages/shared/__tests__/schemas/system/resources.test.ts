import { describe, expect, it } from 'vitest'
import {
  RESOURCE_OPEN_TARGET_BLANK,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  resourceCreateSchema,
  resourceListQuerySchema,
  resourceListResponseSchema,
  resourceSchema,
  resourceTreeNodeSchema,
  resourceUpdateSchema,
} from '../../../src/schemas/system/resources'
import type { Resource } from '../../../src/schemas/system/resources'

function firstIssueMessage(result: { success: false; error: { issues: { message: string }[] } }) {
  return result.error.issues[0]?.message
}

describe('resource schemas', () => {
  it('accepts a resource response with menu fields', () => {
    expect(
      resourceSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        parentId: null,
        type: RESOURCE_TYPE_MENU,
        name: 'Users',
        code: 'system:user',
        path: '/system/users',
        externalUrl: null,
        openTarget: RESOURCE_OPEN_TARGET_SELF,
        icon: 'i-[lucide--users]',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 10,
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_MENU,
      code: 'system:user',
      path: '/system/users',
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })
  })

  it('applies defaults and normalizes nullable fields for directories and actions', () => {
    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_DIRECTORY,
        name: 'System',
        code: 'system',
        icon: '',
      }),
    ).toEqual({
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
      parentId: null,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: null,
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 0,
    })

    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_ACTION,
        name: 'Export Users',
        code: 'system:user:export',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_ACTION,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })
  })

  it('requires internal menus to provide a path', () => {
    const result = resourceCreateSchema.safeParse({
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('内部菜单路径不能为空')
    }
  })

  it('requires external menus to provide an external url and defaults to blank target', () => {
    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_EXTERNAL,
        name: 'Docs',
        code: 'system:docs',
        externalUrl: 'https://example.com/docs',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_EXTERNAL,
      path: null,
      externalUrl: 'https://example.com/docs',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
    })

    const result = resourceCreateSchema.safeParse({
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'Broken Docs',
      code: 'system:broken-docs',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('外链地址不能为空')
    }
  })

  it('parses list query strings into pagination and filters', () => {
    expect(
      resourceListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        keyword: ' user ',
        type: RESOURCE_TYPE_MENU,
        status: '0',
        parentId: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      keyword: 'user',
      type: RESOURCE_TYPE_MENU,
      status: RESOURCE_STATUS_DISABLED,
      parentId: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
    })
  })

  it('accepts recursive resource tree nodes', () => {
    expect(
      resourceTreeNodeSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        parentId: null,
        type: RESOURCE_TYPE_DIRECTORY,
        name: 'System',
        code: 'system',
        path: null,
        externalUrl: null,
        openTarget: RESOURCE_OPEN_TARGET_SELF,
        icon: 'i-[lucide--settings]',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 0,
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
        children: [
          {
            id: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
            parentId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
            type: RESOURCE_TYPE_ACTION,
            name: 'Create User',
            code: 'system:user:create',
            path: null,
            externalUrl: null,
            openTarget: RESOURCE_OPEN_TARGET_SELF,
            icon: null,
            hidden: false,
            status: RESOURCE_STATUS_ENABLED,
            sortOrder: 1,
            createdAt: '2026-05-04T08:00:00.000Z',
            updatedAt: '2026-05-04T08:00:00.000Z',
            children: [],
          },
        ],
      }),
    ).toMatchObject({
      code: 'system',
      children: [{ code: 'system:user:create' }],
    })
  })

  it('parses list query defaults and blank filters', () => {
    expect(resourceListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    })

    expect(resourceListQuerySchema.parse({ keyword: '', parentId: '   ', status: '   ', type: '' })).toEqual(
      {
        page: 1,
        pageSize: 20,
      },
    )
  })

  it('accepts valid resource list responses', () => {
    const listResponse = resourceListResponseSchema.parse({
      list: [
        {
          id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
          parentId: null,
          type: RESOURCE_TYPE_MENU,
          name: 'Users',
          code: 'system:user',
          path: '/system/users',
          externalUrl: null,
          openTarget: RESOURCE_OPEN_TARGET_SELF,
          icon: 'i-[lucide--users]',
          hidden: false,
          status: RESOURCE_STATUS_ENABLED,
          sortOrder: 10,
          createdAt: '2026-05-04T08:00:00.000Z',
          updatedAt: '2026-05-04T08:00:00.000Z',
        } satisfies Resource,
      ],
      total: 10,
      page: 2,
      pageSize: 10,
    }) as any

    expect(listResponse).toMatchObject({
      total: 10,
      page: 2,
      pageSize: 10,
      list: [
        {
          code: 'system:user',
        },
      ],
    })
  })

  it('normalizes ignored external links for menu, directory, and action resources', () => {
    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_MENU,
        name: 'Users',
        code: 'system:user',
        path: '/system/users',
        externalUrl: 'not-a-url',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_MENU,
      externalUrl: null,
      path: '/system/users',
    })

    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_DIRECTORY,
        name: 'System',
        code: 'system',
        path: '/should-be-ignored',
        externalUrl: 'not-a-url',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_DIRECTORY,
      path: null,
      externalUrl: null,
    })

    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_ACTION,
        name: 'Export',
        code: 'system:user:export',
        path: '/should-be-ignored',
        externalUrl: 'not-a-url',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_ACTION,
      path: null,
      externalUrl: null,
    })
  })

  it('forcibly normalizes directory openTarget to self', () => {
    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_DIRECTORY,
        name: 'System',
        code: 'system',
        openTarget: RESOURCE_OPEN_TARGET_BLANK,
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_DIRECTORY,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })
  })

  it('forcibly normalizes action openTarget to self', () => {
    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_ACTION,
        name: 'Export',
        code: 'system:user:export',
        openTarget: RESOURCE_OPEN_TARGET_BLANK,
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_ACTION,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })
  })

  it('requires at least one resource update field', () => {
    const result = resourceUpdateSchema.safeParse({})

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('至少修改一个字段')
    }
  })
})
