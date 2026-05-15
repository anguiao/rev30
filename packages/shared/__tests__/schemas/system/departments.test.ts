import { describe, expect, it } from 'vitest'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  departmentCreateSchema,
  departmentTreeResponseSchema,
  departmentTreeOptionsQuerySchema,
  departmentTreeOptionsResponseSchema,
  departmentListQuerySchema,
  departmentSchema,
  departmentUpdateSchema,
} from '../../../src/schemas/system/departments'
import { prettifyZodError } from '../../helpers/schema'

describe('department schemas', () => {
  it('parses includeIds as comma-separated department ids and deduplicates values', () => {
    const first = 'a1f5aa2c-4f1a-4d39-9ca6-6f4f2b7c8a4a'
    const second = 'a5e58e6f-9f6d-4f1c-9b7f-9df31a9e4d56'

    expect(
      departmentTreeOptionsQuerySchema.parse({ includeIds: `${first}, ${second}, ${first}` }),
    ).toEqual({
      includeIds: [first, second],
    })
  })

  it('parses department includeIds as empty array for blank strings or non-string values', () => {
    expect(departmentTreeOptionsQuerySchema.parse({ includeIds: '' })).toEqual({ includeIds: [] })
    expect(departmentTreeOptionsQuerySchema.parse({ includeIds: '   ' })).toEqual({
      includeIds: [],
    })
    expect(departmentTreeOptionsQuerySchema.parse({ includeIds: {} })).toEqual({ includeIds: [] })
  })

  it('parses department includeIds query with empty object as []', () => {
    expect(departmentTreeOptionsQuerySchema.parse({})).toEqual({ includeIds: [] })
  })

  it('reports invalid department id in includeIds query', () => {
    const result = departmentTreeOptionsQuerySchema.safeParse({
      includeIds: 'a1f5aa2c-4f1a-4d39-9ca6-6f4f2b7c8a4a, invalid-uuid',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('部门 ID 无效')
    }
  })

  it('accepts recursive lightweight department tree options responses', () => {
    expect(
      departmentTreeOptionsResponseSchema.parse([
        {
          id: 'd9e4a3b2-0b6c-47c1-84d3-c8b8af3c2a21',
          parentId: null,
          name: 'Root',
          code: 'root',
          status: DEPARTMENT_STATUS_ENABLED,
          children: [
            {
              id: 'f4b7f0a0-4d0d-4e80-86f4-5f4a5f5dd9b5',
              parentId: 'd9e4a3b2-0b6c-47c1-84d3-c8b8af3c2a21',
              name: 'Child',
              code: 'child',
              status: DEPARTMENT_STATUS_ENABLED,
              children: [
                {
                  id: '7f5a8c53-17fb-4db6-9b6d-a0f8e5f8f6f2',
                  parentId: 'f4b7f0a0-4d0d-4e80-86f4-5f4a5f5dd9b5',
                  name: 'Grandchild',
                  code: 'grandchild',
                  status: DEPARTMENT_STATUS_ENABLED,
                  children: [],
                },
              ],
            },
          ],
        },
      ]),
    ).toMatchObject({
      0: {
        name: 'Root',
        children: [{ name: 'Child', children: [{ name: 'Grandchild' }] }],
      },
    })
  })

  it('accepts a department response with core fields', () => {
    expect(
      departmentSchema.parse({
        id: 'a1f5aa2c-4f1a-4d39-9ca6-6f4f2b7c8a4a',
        parentId: null,
        name: 'Engineering',
        code: 'engineering',
        status: DEPARTMENT_STATUS_ENABLED,
        sortOrder: 1,
        createdAt: '2026-04-29T08:00:00.000Z',
        updatedAt: '2026-04-29T08:00:00.000Z',
      }),
    ).toMatchObject({
      id: 'a1f5aa2c-4f1a-4d39-9ca6-6f4f2b7c8a4a',
      parentId: null,
      name: 'Engineering',
      code: 'engineering',
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 1,
      createdAt: '2026-04-29T08:00:00.000Z',
      updatedAt: '2026-04-29T08:00:00.000Z',
    })
  })

  it('applies defaults for department creation', () => {
    expect(
      departmentCreateSchema.parse({
        name: 'Research',
        code: 'research',
      }),
    ).toEqual({
      name: 'Research',
      code: 'research',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('parses list query strings', () => {
    expect(
      departmentListQuerySchema.parse({
        page: '2',
        pageSize: '20',
        keyword: '  Eng ',
        status: '0',
        parentId: 'a5e58e6f-9f6d-4f1c-9b7f-9df31a9e4d56',
      }),
    ).toEqual({
      page: 2,
      pageSize: 20,
      keyword: 'Eng',
      status: DEPARTMENT_STATUS_DISABLED,
      parentId: 'a5e58e6f-9f6d-4f1c-9b7f-9df31a9e4d56',
    })
  })

  it('accepts recursive department tree responses', () => {
    expect(
      departmentTreeResponseSchema.parse([
        {
          id: 'd9e4a3b2-0b6c-47c1-84d3-c8b8af3c2a21',
          parentId: null,
          name: 'Root',
          code: 'root',
          status: DEPARTMENT_STATUS_ENABLED,
          sortOrder: 0,
          createdAt: '2026-04-29T08:00:00.000Z',
          updatedAt: '2026-04-29T08:00:00.000Z',
          children: [
            {
              id: 'f4b7f0a0-4d0d-4e80-86f4-5f4a5f5dd9b5',
              parentId: 'd9e4a3b2-0b6c-47c1-84d3-c8b8af3c2a21',
              name: 'Child',
              code: 'child',
              status: DEPARTMENT_STATUS_ENABLED,
              sortOrder: 1,
              createdAt: '2026-04-29T08:00:00.000Z',
              updatedAt: '2026-04-29T08:00:00.000Z',
              children: [
                {
                  id: '7f5a8c53-17fb-4db6-9b6d-a0f8e5f8f6f2',
                  parentId: 'f4b7f0a0-4d0d-4e80-86f4-5f4a5f5dd9b5',
                  name: 'Grandchild',
                  code: 'grandchild',
                  status: DEPARTMENT_STATUS_ENABLED,
                  sortOrder: 2,
                  createdAt: '2026-04-29T08:00:00.000Z',
                  updatedAt: '2026-04-29T08:00:00.000Z',
                  children: [],
                },
              ],
            },
          ],
        },
      ]),
    ).toMatchObject([
      {
        name: 'Root',
        children: [
          {
            name: 'Child',
            children: [
              {
                name: 'Grandchild',
              },
            ],
          },
        ],
      },
    ])
  })

  it('requires at least one field for updates', () => {
    const result = departmentUpdateSchema.safeParse({})

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('至少修改一个字段')
    }
  })
})
