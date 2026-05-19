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
  resourceFormSchema,
  resourceTreeResponseSchema,
  resourceTreeOptionsQuerySchema,
  resourceTreeOptionsResponseSchema,
  resourceListQuerySchema,
  resourceListResponseSchema,
  resourceSchema,
  resourceUpdateSchema,
} from '../../../src/schemas/system/resources'
import type { Resource } from '../../../src/schemas/system/resources'
import { prettifyZodError } from '../../helpers/schema'

describe('resource schemas', () => {
  it('parses includeIds as comma-separated resource ids and deduplicates values', () => {
    const first = '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7'
    const second = '4be2dfda-2fd6-4ee5-b06b-c551328bc343'

    expect(
      resourceTreeOptionsQuerySchema.parse({ includeIds: `${first}, ${second}, ${first}` }),
    ).toEqual({
      includeIds: [first, second],
    })
  })

  it('parses resource includeIds as empty array for blank strings or non-string values', () => {
    expect(resourceTreeOptionsQuerySchema.parse({ includeIds: '' })).toEqual({ includeIds: [] })
    expect(resourceTreeOptionsQuerySchema.parse({ includeIds: '   ' })).toEqual({ includeIds: [] })
    expect(resourceTreeOptionsQuerySchema.parse({ includeIds: {} })).toEqual({ includeIds: [] })
  })

  it('parses resource includeIds query with empty object as []', () => {
    expect(resourceTreeOptionsQuerySchema.parse({})).toEqual({ includeIds: [] })
  })

  it('reports invalid resource id in includeIds query', () => {
    const result = resourceTreeOptionsQuerySchema.safeParse({
      includeIds: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7, invalid-uuid',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('资源 ID 无效')
    }
  })

  it('accepts recursive lightweight resource tree options responses', () => {
    expect(
      resourceTreeOptionsResponseSchema.parse([
        {
          id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
          parentId: null,
          type: RESOURCE_TYPE_DIRECTORY,
          name: 'System',
          code: 'system',
          status: RESOURCE_STATUS_ENABLED,
          children: [
            {
              id: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
              parentId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
              type: RESOURCE_TYPE_ACTION,
              name: 'Create User',
              code: 'system:user:create',
              status: RESOURCE_STATUS_ENABLED,
              children: [],
            },
          ],
        },
      ]),
    ).toMatchObject({
      0: {
        code: 'system',
        children: [{ code: 'system:user:create' }],
      },
    })
  })

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
        icon: 'lucide:users',
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

  it('normalizes missing internal menu paths for service-level validation', () => {
    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_MENU,
        name: 'Users',
        code: 'system:user',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_MENU,
      path: null,
      externalUrl: null,
    })
  })

  it('defaults external menus to blank target and leaves final url validation to service', () => {
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

    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_EXTERNAL,
        name: 'Broken Docs',
        code: 'system:broken-docs',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_EXTERNAL,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
    })
  })

  it('validates full resource form submissions before normalization', () => {
    const baseFormInput = {
      name: 'Docs',
      code: 'system:docs',
      parentId: null,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: null,
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 0,
    }

    const missingMenuPath = resourceFormSchema.safeParse({
      ...baseFormInput,
      type: RESOURCE_TYPE_MENU,
    })

    expect(missingMenuPath.success).toBe(false)
    if (!missingMenuPath.success) {
      expect(prettifyZodError(missingMenuPath)).toContain('内部菜单路径不能为空')
    }

    const missingExternalUrl = resourceFormSchema.safeParse({
      ...baseFormInput,
      type: RESOURCE_TYPE_EXTERNAL,
    })

    expect(missingExternalUrl.success).toBe(false)
    if (!missingExternalUrl.success) {
      expect(prettifyZodError(missingExternalUrl)).toContain('外链地址不能为空')
    }

    const invalidExternalUrl = resourceFormSchema.safeParse({
      ...baseFormInput,
      type: RESOURCE_TYPE_EXTERNAL,
      externalUrl: 'not-a-url',
    })

    expect(invalidExternalUrl.success).toBe(false)
    if (!invalidExternalUrl.success) {
      expect(prettifyZodError(invalidExternalUrl)).toContain('外链地址无效')
    }

    expect(
      resourceFormSchema.parse({
        ...baseFormInput,
        type: RESOURCE_TYPE_EXTERNAL,
        externalUrl: 'https://example.com/docs',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_EXTERNAL,
      externalUrl: 'https://example.com/docs',
    })
  })

  it('keeps submitted resource type-specific validation in the service layer', () => {
    const baseFormInput = {
      name: 'Docs',
      code: 'system:docs',
      parentId: null,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: null,
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 0,
    }

    expect(
      resourceCreateSchema.parse({ ...baseFormInput, type: RESOURCE_TYPE_MENU }),
    ).toMatchObject({
      type: RESOURCE_TYPE_MENU,
      path: null,
    })
    expect(
      resourceCreateSchema.parse({
        ...baseFormInput,
        type: RESOURCE_TYPE_EXTERNAL,
        externalUrl: 'not-a-url',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_EXTERNAL,
      externalUrl: 'not-a-url',
    })
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

  it('accepts recursive resource tree responses', () => {
    expect(
      resourceTreeResponseSchema.parse([
        {
          id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
          parentId: null,
          type: RESOURCE_TYPE_DIRECTORY,
          name: 'System',
          code: 'system',
          path: null,
          externalUrl: null,
          openTarget: RESOURCE_OPEN_TARGET_SELF,
          icon: 'lucide:settings',
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
        },
      ]),
    ).toMatchObject([
      {
        code: 'system',
        children: [{ code: 'system:user:create' }],
      },
    ])
  })

  it('parses list query defaults and blank filters', () => {
    expect(resourceListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    })

    expect(
      resourceListQuerySchema.parse({ keyword: '', parentId: '   ', status: '   ', type: '' }),
    ).toEqual({
      page: 1,
      pageSize: 20,
    })
  })

  it('trims resource list query filters before validation', () => {
    expect(
      resourceListQuerySchema.parse({
        type: ' menu ',
        status: ' 1 ',
        parentId: ' 8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7 ',
      }),
    ).toEqual({
      page: 1,
      pageSize: 20,
      type: RESOURCE_TYPE_MENU,
      status: RESOURCE_STATUS_ENABLED,
      parentId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    })
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
          icon: 'lucide:users',
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
    })

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

  it('requires icon fields to use Iconify icon names', () => {
    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_MENU,
        name: 'Users',
        code: 'system:user',
        path: '/system/users',
        icon: 'lucide:users',
      }),
    ).toMatchObject({
      icon: 'lucide:users',
    })

    const createResult = resourceCreateSchema.safeParse({
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
      path: '/system/users',
      icon: 'i-[lucide--users]',
    })

    expect(createResult.success).toBe(false)
    if (!createResult.success) {
      expect(prettifyZodError(createResult)).toContain('图标名称无效')
    }

    const updateResult = resourceUpdateSchema.safeParse({
      icon: 'i-[lucide--users]',
    })

    expect(updateResult.success).toBe(false)
    if (!updateResult.success) {
      expect(prettifyZodError(updateResult)).toContain('图标名称无效')
    }
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
      expect(prettifyZodError(result)).toContain('至少修改一个字段')
    }
  })

  it('defers omitted-type externalUrl validation and validates explicit external updates', () => {
    expect(
      resourceUpdateSchema.parse({
        externalUrl: 'not-a-url',
      }),
    ).toMatchObject({
      externalUrl: 'not-a-url',
    })

    expect(
      resourceUpdateSchema.parse({
        externalUrl: 'https://example.com/docs',
      }),
    ).toMatchObject({
      externalUrl: 'https://example.com/docs',
    })

    const ignoredByMenu = resourceUpdateSchema.parse({
      type: RESOURCE_TYPE_MENU,
      path: '/system/users',
      externalUrl: 'not-a-url',
    })

    expect(ignoredByMenu).toMatchObject({
      type: RESOURCE_TYPE_MENU,
      path: '/system/users',
      externalUrl: null,
    })

    const ignoredByDirectory = resourceUpdateSchema.parse({
      type: RESOURCE_TYPE_DIRECTORY,
      path: '/x',
      externalUrl: 'not-a-url',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
    })

    expect(ignoredByDirectory).toMatchObject({
      type: RESOURCE_TYPE_DIRECTORY,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })

    const ignoredByAction = resourceUpdateSchema.parse({
      type: RESOURCE_TYPE_ACTION,
      path: '/x',
      externalUrl: 'not-a-url',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
    })

    expect(ignoredByAction).toMatchObject({
      type: RESOURCE_TYPE_ACTION,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })

    expect(
      resourceUpdateSchema.parse({
        type: RESOURCE_TYPE_EXTERNAL,
        externalUrl: 'not-a-url',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_EXTERNAL,
      externalUrl: 'not-a-url',
    })

    expect(
      resourceUpdateSchema.parse({
        type: RESOURCE_TYPE_EXTERNAL,
        externalUrl: null,
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_EXTERNAL,
      externalUrl: null,
    })
  })
})
