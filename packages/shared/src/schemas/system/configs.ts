import { z } from 'zod'
import { nonBlankString, optionalNullableString, sortOrderInputSchema } from '../common/inputs'
import { paginationQuerySchema } from '../common/pagination'
import { hasAnyDefinedValue } from '../common/refinements'
import { optionalTrimmedQueryString } from '../query'

export const CONFIG_STATUS_DISABLED = 0
export const CONFIG_STATUS_ENABLED = 1
export const configStatusSchema = z.literal(
  [CONFIG_STATUS_DISABLED, CONFIG_STATUS_ENABLED],
  '配置状态无效',
)

export const CONFIG_VALUE_TYPE_STRING = 'string'
export const CONFIG_VALUE_TYPE_NUMBER = 'number'
export const CONFIG_VALUE_TYPE_BOOLEAN = 'boolean'
export const CONFIG_VALUE_TYPE_JSON = 'json'
export const configValueTypeSchema = z.enum(
  [
    CONFIG_VALUE_TYPE_STRING,
    CONFIG_VALUE_TYPE_NUMBER,
    CONFIG_VALUE_TYPE_BOOLEAN,
    CONFIG_VALUE_TYPE_JSON,
  ],
  '配置值类型无效',
)

const configIdSchema = z.uuid('配置 ID 无效')
const configGroupCodeSchema = nonBlankString('请输入分组编码')
const configKeySchema = nonBlankString('请输入配置键')
const configNameSchema = nonBlankString('请输入配置名称')
const configValueSchema = z.string().trim().min(1, '请输入配置值')
const optionalKeywordSchema = optionalTrimmedQueryString()
const optionalGroupCodeSchema = optionalTrimmedQueryString()
const optionalValueTypeQuerySchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmedValue = value.trim()
  return trimmedValue === '' ? undefined : trimmedValue
}, z.string().trim().pipe(configValueTypeSchema).optional())

const optionalStatusQuerySchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmedValue = value.trim()
  return trimmedValue === '' ? undefined : trimmedValue
}, z.coerce.number().pipe(configStatusSchema).optional())

export function getConfigValueError(valueType: ConfigValueType, value: string) {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return '请输入配置值'
  }

  if (valueType === CONFIG_VALUE_TYPE_NUMBER && !Number.isFinite(Number(trimmedValue))) {
    return '配置值必须是有限数字'
  }

  if (
    valueType === CONFIG_VALUE_TYPE_BOOLEAN &&
    trimmedValue !== 'true' &&
    trimmedValue !== 'false'
  ) {
    return '配置值必须是 true 或 false'
  }

  if (valueType === CONFIG_VALUE_TYPE_JSON) {
    try {
      JSON.parse(trimmedValue)
    } catch {
      return '配置值必须是合法 JSON'
    }
  }

  return null
}

function validateConfigValue(
  input: { valueType?: ConfigValueType | undefined; value?: string | undefined },
  context: z.RefinementCtx,
) {
  if (input.valueType === undefined || input.value === undefined) {
    return
  }

  const message = getConfigValueError(input.valueType, input.value)

  if (message !== null) {
    context.addIssue({
      code: 'custom',
      path: ['value'],
      message,
    })
  }
}

export const configSchema = z.object({
  id: configIdSchema,
  groupCode: nonBlankString(),
  key: nonBlankString(),
  name: nonBlankString(),
  valueType: configValueTypeSchema,
  value: nonBlankString(),
  description: z.string().nullable(),
  status: configStatusSchema,
  sortOrder: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const configListItemSchema = configSchema.omit({
  sortOrder: true,
})

export const configListQuerySchema = paginationQuerySchema.extend({
  keyword: optionalKeywordSchema,
  groupCode: optionalGroupCodeSchema,
  valueType: optionalValueTypeQuerySchema,
  status: optionalStatusQuerySchema,
})

const configFormBaseSchema = z.object({
  groupCode: configGroupCodeSchema,
  key: configKeySchema,
  name: configNameSchema,
  valueType: configValueTypeSchema,
  value: configValueSchema,
  description: optionalNullableString(),
  status: configStatusSchema,
  sortOrder: sortOrderInputSchema,
})

export const configFormSchema = configFormBaseSchema.superRefine(validateConfigValue)

export const configCreateSchema = configFormBaseSchema
  .extend({
    status: configStatusSchema.default(CONFIG_STATUS_ENABLED),
    sortOrder: sortOrderInputSchema.default(0),
  })
  .superRefine(validateConfigValue)

export const configUpdateSchema = configFormBaseSchema
  .partial()
  .superRefine(validateConfigValue)
  .refine(hasAnyDefinedValue, {
    message: '至少修改一个字段',
  })

export const configListResponseSchema = z.object({
  list: z.array(configListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type Config = z.infer<typeof configSchema>
export type ConfigListItem = z.infer<typeof configListItemSchema>
export type ConfigListQuery = z.infer<typeof configListQuerySchema>
export type ConfigFormInput = z.infer<typeof configFormSchema>
export type ConfigCreateInput = z.infer<typeof configCreateSchema>
export type ConfigUpdateInput = z.infer<typeof configUpdateSchema>
export type ConfigListResponse = z.infer<typeof configListResponseSchema>
export type ConfigStatus = z.infer<typeof configStatusSchema>
export type ConfigValueType = z.infer<typeof configValueTypeSchema>
