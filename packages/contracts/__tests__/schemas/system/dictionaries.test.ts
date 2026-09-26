import { describe, expect, it } from 'vitest'
import {
  DICTIONARY_STATUS_DISABLED,
  DICTIONARY_STATUS_ENABLED,
  dictionaryCreateSchema,
  dictionaryDetailSchema,
  dictionaryFormSchema,
  dictionaryItemSchema,
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

  it.each(['typeId', 'createdAt', 'updatedAt'] as const)(
    'rejects dictionary detail items without %s',
    (field) => {
      const { [field]: _missing, ...item } = dictionaryDetail.items[0]!
      const result = dictionaryDetailSchema.safeParse({ ...dictionaryDetail, items: [item] })

      expectZodIssue(result, { code: 'invalid_type', path: ['items', 0, field] })
    },
  )

  it('rejects dictionary details without descriptions', () => {
    const result = dictionaryDetailSchema.safeParse({
      ...dictionaryDetail,
      description: undefined,
    })
    expectZodIssue(result, { code: 'invalid_union', path: ['description'] })
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

    expectZodIssue(result, { code: 'invalid_union', path: ['list', 0, 'description'] })
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
    expectZodIssue(createWithLongDescription, { code: 'too_big', path: ['description'] })

    const updateWithLongDescription = dictionaryUpdateSchema.safeParse({
      code: 'long.description',
      name: '过长描述',
      description: tooLongDescription,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
      items: [],
    })
    expectZodIssue(updateWithLongDescription, { code: 'too_big', path: ['description'] })
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

  it.each([
    { label: '待支付', value: 'pending-payment', status: DICTIONARY_STATUS_ENABLED },
    { label: '启用', value: '0', status: DICTIONARY_STATUS_ENABLED },
    { label: '禁用', value: '1', status: DICTIONARY_STATUS_DISABLED },
    { label: '男', value: 'male', status: DICTIONARY_STATUS_ENABLED },
  ])('accepts dictionary item value $value', (input) => {
    expect(dictionaryItemSchema.parse({ ...dictionaryDetail.items[0], ...input })).toMatchObject(
      input,
    )
  })

  it.each([
    { value: '   ', message: '字典项值不能为空' },
    { value: 'male,1', message: '字典项值不能包含逗号' },
  ])('rejects dictionary item value "$value"', ({ value, message }) => {
    expectZodIssue(dictionaryItemSchema.safeParse({ ...dictionaryDetail.items[0], value }), {
      message,
      path: ['value'],
    })
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

    expectZodIssue(duplicateCreate, { message: '字典项值不能重复', path: ['items', 1, 'value'] })

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

    expectZodIssue(duplicateUpdate, { message: '字典项值不能重复', path: ['items', 1, 'value'] })
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
    expectZodIssue(invalidCodes, { message: '字典编码格式无效', path: ['codes', 0] })

    const blankCodes = dictionaryOptionsQuerySchema.safeParse({
      codes: '',
    })
    expectZodIssue(blankCodes, { message: '字典编码不能为空', path: ['codes'] })

    const nonStringCode = dictionaryOptionsQuerySchema.safeParse({
      codes: ['gender', 1],
    })
    expectZodIssue(nonStringCode, { code: 'invalid_type', path: ['codes', 1] })

    const topLevelInvalid = dictionaryOptionsQuerySchema.safeParse({
      codes: 123,
    })
    expectZodIssue(topLevelInvalid, { code: 'invalid_type', path: ['codes'] })

    const onlyEmptyCodes = dictionaryOptionsQuerySchema.safeParse({
      codes: ', ,',
    })
    expectZodIssue(onlyEmptyCodes, { message: '字典编码不能为空', path: ['codes'] })

    expect(
      dictionaryOptionsQuerySchema.parse({
        codes: ['gender', ' user_status ', 'gender'],
      }),
    ).toEqual({
      codes: ['gender', 'user_status'],
    })
  })

  it('preserves valid dictionary options response fields', () => {
    const options = {
      gender: [
        { label: '男', value: 'male' },
        { label: '女', value: 'female' },
      ],
    }
    expect(dictionaryOptionsResponseSchema.parse(options)).toEqual(options)
  })

  it.each([
    {
      input: { Gender: [{ label: '男', value: 'male' }] },
      code: 'invalid_key' as const,
      path: ['Gender'],
    },
    {
      input: { gender: [{ label: '坏值', value: 'male,1' }] },
      code: 'custom' as const,
      path: ['gender', 0, 'value'],
    },
    {
      input: { gender: [{ label: '超长', value: 'a'.repeat(65) }] },
      code: 'too_big' as const,
      path: ['gender', 0, 'value'],
    },
    {
      input: { gender: [{ label: 'a'.repeat(65), value: 'male' }] },
      code: 'too_big' as const,
      path: ['gender', 0, 'label'],
    },
  ])('rejects invalid dictionary options at $path', ({ input, code, path }) => {
    expectZodIssue(dictionaryOptionsResponseSchema.safeParse(input), { code, path })
  })

  it('accepts complete dictionary update fields', () => {
    const input = {
      code: 'gender',
      name: '性别',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 1,
      items: [],
    }

    expect(dictionaryUpdateSchema.parse(input)).toEqual(input)
  })

  it.each([
    { field: 'code', code: 'invalid_type' },
    { field: 'name', code: 'invalid_type' },
    { field: 'status', code: 'invalid_value' },
    { field: 'sortOrder', code: 'invalid_type' },
    { field: 'items', code: 'invalid_type' },
  ] as const)('rejects dictionary updates without $field', ({ field, code }) => {
    const { [field]: _missing, ...input } = {
      code: 'gender',
      name: '性别',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 1,
      items: [],
    }

    expectZodIssue(dictionaryUpdateSchema.safeParse(input), { code, path: [field] })
  })
})
