import { z } from 'zod'
import { nonBlankString, optionalNullableString, sortOrderInputSchema } from '../common/inputs'
import { paginationQuerySchema } from '../common/pagination'
import { optionalNumericQueryValue, optionalTrimmedQueryString } from '../query'

export const DICTIONARY_STATUS_DISABLED = 0
export const DICTIONARY_STATUS_ENABLED = 1
export const dictionaryStatusSchema = z.literal(
  [DICTIONARY_STATUS_DISABLED, DICTIONARY_STATUS_ENABLED],
  '字典状态无效',
)

const dictionaryIdSchema = z.uuid('字典 ID 无效')
const dictionaryCodeSchema = z
  .string()
  .trim()
  .min(1, '字典编码不能为空')
  .max(64, '字典编码不能超过 64 个字符')
  .regex(/^[a-z][a-z0-9_.-]*$/, '字典编码格式无效')
const dictionaryNameSchema = nonBlankString('请输入字典名称').max(64)
const dictionaryItemLabelSchema = nonBlankString('请输入字典项名称').max(64)
const dictionaryDescriptionSchema = z.union([z.string().max(500), z.null()])
const dictionaryDescriptionInputSchema = optionalNullableString().pipe(
  z.union([z.string().trim().max(500), z.null()]).optional(),
)

const dictionaryItemValueSchema = z
  .string()
  .trim()
  .min(1, '字典项值不能为空')
  .max(64)
  .refine((value) => !value.includes(','), {
    message: '字典项值不能包含逗号',
  })

function ensureUniqueDictionaryItems(
  input: { items: Array<{ value: string }> },
  context: z.RefinementCtx,
) {
  const values = new Set<string>()

  for (const item of input.items) {
    if (values.has(item.value)) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: '字典项值不能重复',
      })
      return
    }

    values.add(item.value)
  }
}

function normalizeDictionaryCodes(value: unknown) {
  const codes = typeof value === 'string' ? value.split(',') : value

  if (!Array.isArray(codes)) {
    return value
  }

  return [...new Set(codes.map((item) => (typeof item === 'string' ? item.trim() : item)))].filter(
    (item) => item !== '',
  )
}

const dictionaryItemInputSchema = z.object({
  label: dictionaryItemLabelSchema,
  value: dictionaryItemValueSchema,
  description: dictionaryDescriptionInputSchema,
  status: dictionaryStatusSchema.default(DICTIONARY_STATUS_ENABLED),
  sortOrder: sortOrderInputSchema.default(0),
})

const dictionaryItemCreateInputSchema = dictionaryItemInputSchema

const dictionaryItemUpdateInputSchema = dictionaryItemInputSchema.extend({
  id: dictionaryIdSchema.optional(),
  status: dictionaryStatusSchema,
  sortOrder: sortOrderInputSchema,
})

export const dictionaryItemSchema = z.object({
  id: dictionaryIdSchema,
  typeId: dictionaryIdSchema,
  label: dictionaryItemLabelSchema,
  value: dictionaryItemValueSchema,
  description: dictionaryDescriptionSchema,
  status: dictionaryStatusSchema,
  sortOrder: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const dictionaryTypeSchema = z.object({
  id: dictionaryIdSchema,
  code: dictionaryCodeSchema,
  name: dictionaryNameSchema,
  description: dictionaryDescriptionSchema,
  status: dictionaryStatusSchema,
  sortOrder: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const dictionaryListItemSchema = dictionaryTypeSchema.extend({
  itemCount: z.number().int().min(0),
})

export const dictionaryDetailSchema = dictionaryTypeSchema.extend({
  items: z.array(dictionaryItemSchema),
})

export const dictionaryListQuerySchema = paginationQuerySchema.extend({
  keyword: optionalTrimmedQueryString(),
  status: optionalNumericQueryValue(dictionaryStatusSchema),
})

const dictionaryFormBaseSchema = z.object({
  code: dictionaryCodeSchema,
  name: dictionaryNameSchema,
  description: dictionaryDescriptionInputSchema,
  status: dictionaryStatusSchema,
  sortOrder: sortOrderInputSchema,
  items: z.array(dictionaryItemUpdateInputSchema),
})

export const dictionaryFormSchema = dictionaryFormBaseSchema.superRefine(
  ensureUniqueDictionaryItems,
)

export const dictionaryCreateSchema = z
  .object(dictionaryFormBaseSchema.shape)
  .extend({
    status: dictionaryStatusSchema.default(DICTIONARY_STATUS_ENABLED),
    sortOrder: sortOrderInputSchema.default(0),
    items: z.array(dictionaryItemCreateInputSchema).default([]),
  })
  .superRefine(ensureUniqueDictionaryItems)

export const dictionaryUpdateSchema = dictionaryFormSchema

export const dictionaryListResponseSchema = z.object({
  list: z.array(dictionaryListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export const dictionaryOptionSchema = z.object({
  label: dictionaryItemLabelSchema,
  value: dictionaryItemValueSchema,
})

export const dictionaryOptionsResponseSchema = z.record(
  dictionaryCodeSchema,
  z.array(dictionaryOptionSchema),
)

export const dictionaryOptionsQuerySchema = z.object({
  codes: z.preprocess(
    normalizeDictionaryCodes,
    z.array(dictionaryCodeSchema).min(1, '字典编码不能为空'),
  ),
})

export type DictionaryStatus = z.infer<typeof dictionaryStatusSchema>
export type DictionaryItem = z.infer<typeof dictionaryItemSchema>
export type DictionaryType = z.infer<typeof dictionaryTypeSchema>
export type DictionaryListItem = z.infer<typeof dictionaryListItemSchema>
export type DictionaryDetail = z.infer<typeof dictionaryDetailSchema>
export type DictionaryListQuery = z.infer<typeof dictionaryListQuerySchema>
export type DictionaryListResponse = z.infer<typeof dictionaryListResponseSchema>
export type DictionaryFormInput = z.infer<typeof dictionaryFormSchema>
export type DictionaryCreateInput = z.infer<typeof dictionaryCreateSchema>
export type DictionaryUpdateInput = z.infer<typeof dictionaryUpdateSchema>
export type DictionaryOptionsQuery = z.infer<typeof dictionaryOptionsQuerySchema>
export type DictionaryOptionsResponse = z.infer<typeof dictionaryOptionsResponseSchema>
