import { describe, expect, it } from 'vitest'
import {
  DICTIONARY_STATUS_DISABLED,
  DICTIONARY_STATUS_ENABLED,
  dictionaryCreateSchema,
  dictionaryDetailSchema,
  dictionaryFormSchema,
  dictionaryItemSchema,
  dictionaryListItemSchema,
  dictionaryListQuerySchema,
  dictionaryListResponseSchema,
  dictionaryOptionsQuerySchema,
  dictionaryOptionsResponseSchema,
  dictionaryUpdateSchema,
  type DictionaryFormInput,
} from '../../../src/system/dictionaries'
import { expectZodIssue } from '../../helpers/schema'

const dictionaryDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'gender',
  name: '性别',
  description: null,
  status: DICTIONARY_STATUS_ENABLED,
  sortOrder: 1,
  createdAt: '2026-05-04T08:00:00.000Z',
  updatedAt: '2026-05-04T08:00:00.000Z',
  items: [
    {
      id: '11111111-1111-4111-8111-111111111112',
      typeId: '11111111-1111-4111-8111-111111111111',
      label: '男',
      value: 'male',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
      createdAt: '2026-05-04T08:00:00.000Z',
      updatedAt: '2026-05-04T08:00:00.000Z',
    },
    {
      id: '11111111-1111-4111-8111-111111111113',
      typeId: '11111111-1111-4111-8111-111111111111',
      label: '女',
      value: 'female',
      description: '女性',
      status: DICTIONARY_STATUS_DISABLED,
      sortOrder: 1,
      createdAt: '2026-05-04T08:00:00.000Z',
      updatedAt: '2026-05-04T08:00:00.000Z',
    },
  ],
}
const dictionaryListResponse = {
  list: [
    {
      id: dictionaryDetail.id,
      code: dictionaryDetail.code,
      name: dictionaryDetail.name,
      description: dictionaryDetail.description,
      status: dictionaryDetail.status,
      sortOrder: dictionaryDetail.sortOrder,
      itemCount: 2,
      createdAt: dictionaryDetail.createdAt,
      updatedAt: dictionaryDetail.updatedAt,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}
const dictionaryOptionsResponse = {
  gender: [
    { label: '男', value: 'male' },
    { label: '女', value: 'female' },
  ],
  user_status: [{ label: '待审核', value: 'pending-payment' }],
}

describe('dictionary schemas', () => {
  it('accepts dictionary detail responses with item details', () => {
    expect(dictionaryDetailSchema.parse(dictionaryDetail)).toMatchObject({
      code: 'gender',
      items: [{ label: '男' }, { label: '女' }],
    })
  })

  it('rejects dictionary detail items without timestamps or type ids', () => {
    const result = dictionaryDetailSchema.safeParse({
      ...dictionaryDetail,
      items: [
        {
          id: '11111111-1111-4111-8111-111111111112',
          label: '男',
          value: 'male',
          description: null,
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 0,
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('rejects dictionary details without descriptions', () => {
    const result = dictionaryDetailSchema.safeParse({
      ...dictionaryDetail,
      description: undefined,
    })
    expect(result.success).toBe(false)
  })

  it('accepts paginated dictionary list responses', () => {
    expect(dictionaryListResponseSchema.parse(dictionaryListResponse)).toMatchObject({
      total: 1,
      list: [{ itemCount: 2, code: 'gender' }],
    })
  })

  it('rejects dictionary list items without descriptions', () => {
    const result = dictionaryListResponseSchema.safeParse({
      list: [
        {
          id: dictionaryDetail.id,
          code: dictionaryDetail.code,
          name: dictionaryDetail.name,
          status: dictionaryDetail.status,
          sortOrder: dictionaryDetail.sortOrder,
          itemCount: 2,
          createdAt: dictionaryDetail.createdAt,
          updatedAt: dictionaryDetail.updatedAt,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })

    expect(result.success).toBe(false)
  })

  it('accepts dictionary options grouped by code', () => {
    expect(dictionaryOptionsResponseSchema.parse(dictionaryOptionsResponse)).toEqual(
      dictionaryOptionsResponse,
    )
  })

  it('defaults dictionary create status and sortOrder and normalizes blank description', () => {
    expect(
      dictionaryCreateSchema.parse({
        code: 'user_status',
        name: '用户状态',
        description: '   ',
        items: [
          {
            label: '待支付',
            value: 'pending-payment',
          },
          {
            label: '禁用',
            value: '0',
          },
        ],
      }),
    ).toEqual({
      code: 'user_status',
      name: '用户状态',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
      items: [
        {
          label: '待支付',
          value: 'pending-payment',
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 0,
        },
        {
          label: '禁用',
          value: '0',
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 0,
        },
      ],
    })
  })

  it('defaults create input items as empty array', () => {
    expect(
      dictionaryCreateSchema.parse({
        code: 'order.status',
        name: '订单状态',
      }),
    ).toMatchObject({
      code: 'order.status',
      name: '订单状态',
      items: [],
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('accepts dictionary form input with editable items', () => {
    const formInput: DictionaryFormInput = dictionaryFormSchema.parse({
      code: 'user_status',
      name: '用户状态',
      description: '状态说明',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 1,
      items: [
        {
          id: '11111111-1111-4111-8111-111111111112',
          label: '启用',
          value: 'active',
          description: null,
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 0,
        },
        {
          label: '禁用',
          value: 'disabled',
          description: '不可用状态',
          status: DICTIONARY_STATUS_DISABLED,
          sortOrder: 1,
        },
      ],
    })

    expect(formInput.items).toHaveLength(2)
    expect(formInput.items[0]?.id).toBe('11111111-1111-4111-8111-111111111112')
  })

  it('rejects create and update description longer than 500 characters', () => {
    const tooLongDescription = 'a'.repeat(501)

    const createWithLongDescription = dictionaryCreateSchema.safeParse({
      code: 'long.description',
      name: '过长描述',
      description: tooLongDescription,
    })
    expect(createWithLongDescription.success).toBe(false)

    const updateWithLongDescription = dictionaryUpdateSchema.safeParse({
      code: 'long.description',
      name: '过长描述',
      description: tooLongDescription,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
      items: [],
    })
    expect(updateWithLongDescription.success).toBe(false)
  })

  it('accepts create and update description at the 500-character boundary', () => {
    const maxDescription = 'a'.repeat(500)

    expect(
      dictionaryCreateSchema.parse({
        code: 'long.description',
        name: '描述边界',
        description: maxDescription,
      }).description,
    ).toBe(maxDescription)

    expect(
      dictionaryUpdateSchema.parse({
        code: 'long.description',
        name: '描述边界',
        description: maxDescription,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
        items: [],
      }).description,
    ).toBe(maxDescription)
  })

  it('validates dictionary code format', () => {
    expect(dictionaryCreateSchema.safeParse({ code: 'gender', name: '性别' }).success).toBe(true)
    expect(
      dictionaryCreateSchema.safeParse({ code: 'user_status', name: '用户状态' }).success,
    ).toBe(true)
    expect(
      dictionaryCreateSchema.safeParse({ code: 'order.status', name: '订单状态' }).success,
    ).toBe(true)

    const upperCaseCode = dictionaryCreateSchema.safeParse({
      code: 'Gender',
      name: '性别',
    })
    expectZodIssue(upperCaseCode, { message: '字典编码格式无效' })

    const blankCode = dictionaryCreateSchema.safeParse({
      code: '  ',
      name: '性别',
    })
    expect(blankCode.success).toBe(false)

    const codeWithComma = dictionaryCreateSchema.safeParse({
      code: 'order,status',
      name: '订单状态',
    })
    expectZodIssue(codeWithComma, { message: '字典编码格式无效' })

    const invalidChars = dictionaryCreateSchema.safeParse({
      code: 'order-status!',
      name: '订单状态',
    })
    expectZodIssue(invalidChars, { message: '字典编码格式无效' })
  })

  it('validates dictionary item value and forbids comma', () => {
    expect(
      dictionaryItemSchema.parse({
        id: '11111111-1111-4111-8111-111111111112',
        typeId: '11111111-1111-4111-8111-111111111111',
        label: '待支付',
        value: 'pending-payment',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
      }),
    ).toMatchObject({
      label: '待支付',
      value: 'pending-payment',
    })

    expect(
      dictionaryItemSchema.parse({
        id: '11111111-1111-4111-8111-111111111112',
        typeId: '11111111-1111-4111-8111-111111111111',
        label: '启用',
        value: '0',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
      }),
    ).toMatchObject({
      label: '启用',
      value: '0',
    })

    expect(
      dictionaryItemSchema.parse({
        id: '11111111-1111-4111-8111-111111111112',
        typeId: '11111111-1111-4111-8111-111111111111',
        label: '禁用',
        value: '1',
        description: null,
        status: DICTIONARY_STATUS_DISABLED,
        sortOrder: 0,
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
      }),
    ).toMatchObject({
      label: '禁用',
      value: '1',
    })

    expect(
      dictionaryItemSchema.parse({
        id: '11111111-1111-4111-8111-111111111112',
        typeId: '11111111-1111-4111-8111-111111111111',
        label: '男',
        value: 'male',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
      }),
    ).toMatchObject({
      label: '男',
      value: 'male',
    })

    const blankValue = dictionaryItemSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111112',
      typeId: '11111111-1111-4111-8111-111111111111',
      label: '空',
      value: '   ',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
      createdAt: '2026-05-04T08:00:00.000Z',
      updatedAt: '2026-05-04T08:00:00.000Z',
    })
    expect(blankValue.success).toBe(false)

    const commaValue = dictionaryItemSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111112',
      typeId: '11111111-1111-4111-8111-111111111111',
      label: '有逗号',
      value: 'male,1',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
      createdAt: '2026-05-04T08:00:00.000Z',
      updatedAt: '2026-05-04T08:00:00.000Z',
    })
    expectZodIssue(commaValue, { message: '字典项值不能包含逗号' })
  })

  it('requires unique dictionary item values for create and update payloads', () => {
    const duplicateCreate = dictionaryCreateSchema.safeParse({
      code: 'gender',
      name: '性别',
      items: [
        {
          label: '男',
          value: 'male',
        },
        {
          label: '男性',
          value: 'male',
        },
      ],
    })

    const createError = expectZodIssue(duplicateCreate, { message: '字典项值不能重复' })
    expect(createError.issues.some((issue) => issue.path[0] === 'items')).toBe(true)

    const duplicateUpdate = dictionaryUpdateSchema.safeParse({
      code: 'gender',
      name: '性别',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 1,
      items: [
        {
          label: '男',
          value: 'male',
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 0,
        },
        {
          label: '再来一个男',
          value: 'male',
          status: DICTIONARY_STATUS_DISABLED,
          sortOrder: 1,
        },
      ],
    })

    const updateError = expectZodIssue(duplicateUpdate, { message: '字典项值不能重复' })
    expect(updateError.issues.some((issue) => issue.path[0] === 'items')).toBe(true)
  })

  it('parses list query values and normalizes filters', () => {
    expect(
      dictionaryListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        keyword: '  性别 ',
        status: '1',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      keyword: '性别',
      status: DICTIONARY_STATUS_ENABLED,
    })
  })

  it('parses dictionary option codes as deduplicated list', () => {
    expect(
      dictionaryOptionsQuerySchema.parse({
        codes: 'gender, user_status, gender',
      }),
    ).toEqual({
      codes: ['gender', 'user_status'],
    })

    const invalidCodes = dictionaryOptionsQuerySchema.safeParse({
      codes: 'Gender',
    })
    expectZodIssue(invalidCodes, { message: '字典编码格式无效' })

    const blankCodes = dictionaryOptionsQuerySchema.safeParse({
      codes: '',
    })
    expect(blankCodes.success).toBe(false)

    const nonStringCode = dictionaryOptionsQuerySchema.safeParse({
      codes: ['gender', 1 as unknown],
    })
    expect(nonStringCode.success).toBe(false)

    const topLevelInvalid = dictionaryOptionsQuerySchema.safeParse({
      codes: 123 as unknown,
    })
    expect(topLevelInvalid.success).toBe(false)

    const onlyEmptyCodes = dictionaryOptionsQuerySchema.safeParse({
      codes: ', ,',
    })
    expect(onlyEmptyCodes.success).toBe(false)

    expect(
      dictionaryOptionsQuerySchema.parse({
        codes: ['gender', ' user_status ', 'gender'],
      }),
    ).toEqual({
      codes: ['gender', 'user_status'],
    })
  })

  it('validates dictionary options response contract', () => {
    expect(
      dictionaryOptionsResponseSchema.safeParse({
        gender: [
          {
            label: '男',
            value: 'male',
          },
          {
            label: '女',
            value: 'female',
          },
        ],
      }).success,
    ).toBe(true)

    expect(
      dictionaryOptionsResponseSchema.safeParse({
        Gender: [
          {
            label: '男',
            value: 'male',
          },
        ],
      }).success,
    ).toBe(false)

    expect(
      dictionaryOptionsResponseSchema.safeParse({
        gender: [
          {
            label: '坏值',
            value: 'male,1',
          },
        ],
      }).success,
    ).toBe(false)

    expect(
      dictionaryOptionsResponseSchema.safeParse({
        gender: [
          {
            label: '超长',
            value: 'a'.repeat(65),
          },
        ],
      }).success,
    ).toBe(false)

    expect(
      dictionaryOptionsResponseSchema.safeParse({
        gender: [
          {
            label: 'a'.repeat(65),
            value: 'male',
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('requires dictionary update payload to include complete fields', () => {
    const result = dictionaryUpdateSchema.safeParse({
      code: 'gender',
      name: '性别',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 1,
      items: [],
    })
    expect(result.success).toBe(true)

    expect(
      dictionaryUpdateSchema.safeParse({
        name: '性别',
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 1,
        items: [],
      }).success,
    ).toBe(false)

    expect(
      dictionaryUpdateSchema.safeParse({
        code: 'gender',
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 1,
        items: [],
      }).success,
    ).toBe(false)

    expect(
      dictionaryUpdateSchema.safeParse({
        code: 'gender',
        name: '性别',
        sortOrder: 1,
        items: [],
      }).success,
    ).toBe(false)

    expect(
      dictionaryUpdateSchema.safeParse({
        code: 'gender',
        name: '性别',
        status: DICTIONARY_STATUS_ENABLED,
        items: [],
      }).success,
    ).toBe(false)

    expect(
      dictionaryUpdateSchema.safeParse({
        code: 'gender',
        name: '性别',
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 1,
      }).success,
    ).toBe(false)
  })

  it('validates dictionary list item structure', () => {
    expect(
      dictionaryListItemSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        code: 'gender',
        name: '性别',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
        itemCount: 3,
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
      }),
    ).toMatchObject({
      itemCount: 3,
    })
  })
})
