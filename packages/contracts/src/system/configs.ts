import { z } from 'zod'

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

export const configKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/, '配置键格式无效')

export const configCustomValueSchema = z.string().trim().min(1, '请输入自定义值')

export const configSchema = z.object({
  key: configKeySchema,
  name: z.string().trim().min(1),
  description: z.string(),
  valueType: configValueTypeSchema,
  defaultValue: z.string(),
  customValue: z.string().nullable(),
  value: z.string(),
})

export const configListResponseSchema = z.array(configSchema)

export const configUpdateSchema = z.object({
  customValue: z.union([configCustomValueSchema, z.null()]),
})

export type Config = z.infer<typeof configSchema>
export type ConfigListItem = Config
export type ConfigListResponse = z.infer<typeof configListResponseSchema>
export type ConfigUpdateInput = z.infer<typeof configUpdateSchema>
export type ConfigValueType = z.infer<typeof configValueTypeSchema>
