import { z } from 'zod'
import { pageSizeSchema } from './common/pagination'
import { hasAnyDefinedValue } from './common/refinements'
import { optionalQueryValue, optionalTrimmedQueryString } from './query'

const iconFileExtension = '.json'
export const iconifyIconNamePartPatternSource = '[a-z0-9]+(?:-[a-z0-9]+)*'
const iconDataIconsMaxLength = 500
const iconFilenamePattern = new RegExp(`^${iconifyIconNamePartPatternSource}\\.json$`)
const iconDataIconsPattern = new RegExp(
  `^(?:${iconifyIconNamePartPatternSource}(?:,${iconifyIconNamePartPatternSource})*)?$`,
)
export const iconifyIconNamePattern = new RegExp(
  `^${iconifyIconNamePartPatternSource}:${iconifyIconNamePartPatternSource}$`,
)

export const iconDataParamSchema = z
  .object({
    filename: z.string().regex(iconFilenamePattern, '图标文件名无效'),
  })
  .transform(({ filename }) => ({
    prefix: filename.slice(0, -iconFileExtension.length),
  }))

export const iconDataQuerySchema = z.object({
  icons: z
    .string()
    .max(iconDataIconsMaxLength, '图标请求过长')
    .regex(iconDataIconsPattern, '图标名称无效')
    .transform((value) => value.split(',')),
  pretty: z.string().optional().transform(Boolean),
})

const iconSearchLimitDefault = 60
const iconSearchLimitMax = 100
const iconSearchKeywordMaxLength = 120

const iconSearchLimitSchema = z
  .string()
  .optional()
  .default(String(iconSearchLimitDefault))
  .transform((value) => Number(value))
  .pipe(z.number().int().min(1))
  .transform((value) => Math.min(value, iconSearchLimitMax))

export const iconSearchQuerySchema = z.object({
  keyword: z
    .string()
    .optional()
    .default('')
    .transform((value) => value.trim())
    .pipe(z.string().max(iconSearchKeywordMaxLength, '搜索关键词过长')),
  limit: iconSearchLimitSchema,
})

export const iconSearchItemSchema = z.object({
  icon: z.string().regex(iconifyIconNamePattern, '图标名称无效'),
  prefix: z.string().min(1),
  name: z.string().min(1),
  collection: z.string().min(1),
  palette: z.boolean(),
})

export const iconSearchResponseSchema = z.object({
  list: iconSearchItemSchema.array(),
})

const iconSetPrefixPattern = new RegExp(`^${iconifyIconNamePartPatternSource}$`)
const iconSetIconPageSizeDefault = 80
const customIconSetNameMaxLength = 80
const customIconSetDescriptionMaxLength = 300

const iconSetPrefixSchema = z.string().regex(iconSetPrefixPattern, '图标集前缀无效')
const iconSetNameSchema = z.string().regex(iconSetPrefixPattern, '图标名称无效')

const iconSetKeywordSchema = optionalTrimmedQueryString()
const iconSetIconCursorSchema = optionalQueryValue(
  z.string().trim().regex(iconifyIconNamePattern, '分页游标无效'),
)

const customIconSetNameInputSchema = z
  .string()
  .trim()
  .min(1, '请输入图标集名称')
  .max(customIconSetNameMaxLength)
const customIconSetDescriptionValueSchema = z.union([
  z.string().trim().max(customIconSetDescriptionMaxLength, '图标集描述不能超过 300 个字符'),
  z.null(),
])
const customIconSetDescriptionInputSchema = z
  .union([z.string(), z.null()])
  .transform((value) => (typeof value === 'string' && value.trim() === '' ? null : value))
  .pipe(customIconSetDescriptionValueSchema)

export const iconSetListQuerySchema = z.object({
  keyword: iconSetKeywordSchema,
})

export const iconSetIconListQuerySchema = z.object({
  keyword: iconSetKeywordSchema,
  prefix: iconSetPrefixSchema.optional(),
  cursor: iconSetIconCursorSchema,
  pageSize: pageSizeSchema.default(iconSetIconPageSizeDefault),
})

export const iconSetPrefixParamSchema = z.object({
  prefix: iconSetPrefixSchema,
})

export const iconItemSchema = z.object({
  icon: z.string().regex(iconifyIconNamePattern, '图标名称无效'),
  prefix: iconSetPrefixSchema,
  name: iconSetNameSchema,
  setName: z.string().min(1),
  body: z.string().min(1),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
})

export const iconSetIconItemSchema = iconItemSchema

export const builtinIconSetItemSchema = z.object({
  prefix: iconSetPrefixSchema,
  name: z.string().min(1),
  total: z.number().int().min(0),
})

export const builtinIconSetListResponseSchema = z.object({
  list: builtinIconSetItemSchema.array(),
  total: z.number().int().min(0),
})

export const builtinIconListResponseSchema = z.object({
  list: iconSetIconItemSchema.array(),
  nextCursor: z.string().regex(iconifyIconNamePattern, '分页游标无效').nullable(),
  pageSize: z.number().int().min(1),
})

export const customIconSetSchema = z.object({
  prefix: iconSetPrefixSchema,
  name: customIconSetNameInputSchema,
  description: z.string().nullable(),
  iconCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const customIconSetListResponseSchema = z.object({
  list: customIconSetSchema.array(),
  total: z.number().int().min(0),
})

export const customIconParamSchema = iconSetPrefixParamSchema.extend({
  name: iconSetNameSchema,
})

export const customIconItemSchema = iconItemSchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const customIconListResponseSchema = z.object({
  list: customIconItemSchema.array(),
  nextCursor: z.string().regex(iconifyIconNamePattern, '分页游标无效').nullable(),
  pageSize: z.number().int().min(1),
})

export const customIconSetFormSchema = z.object({
  prefix: iconSetPrefixSchema,
  name: customIconSetNameInputSchema,
  description: customIconSetDescriptionInputSchema,
})

export const customIconSetCreateSchema = customIconSetFormSchema.extend({
  description: customIconSetDescriptionInputSchema.default(null),
})

export const customIconSetUpdateSchema = customIconSetFormSchema
  .omit({
    prefix: true,
  })
  .partial()
  .refine(hasAnyDefinedValue, {
    message: '至少修改一个字段',
  })

export const customIconDuplicateStrategySchema = z.enum(['skip', 'replace'], '重复处理策略无效')

export const iconSetRenameIconSchema = z.object({
  name: iconSetNameSchema,
})

export const customIconUploadSkippedSchema = z.object({
  name: iconSetNameSchema,
  sourceFilename: z.string().min(1),
  reason: z.literal('duplicate'),
})

export const customIconUploadFailedSchema = z.object({
  sourceFilename: z.string().min(1),
  message: z.string().min(1),
})

export const customIconUploadResponseSchema = z.object({
  created: customIconItemSchema.array(),
  replaced: customIconItemSchema.array(),
  skipped: customIconUploadSkippedSchema.array(),
  failed: customIconUploadFailedSchema.array(),
})

export type IconDataParam = z.infer<typeof iconDataParamSchema>
export type IconDataQuery = z.infer<typeof iconDataQuerySchema>
export type IconSearchQuery = z.infer<typeof iconSearchQuerySchema>
export type IconSearchItem = z.infer<typeof iconSearchItemSchema>
export type IconSearchResponse = z.infer<typeof iconSearchResponseSchema>
export type IconItem = z.infer<typeof iconItemSchema>
export type IconSetListQuery = z.infer<typeof iconSetListQuerySchema>
export type IconSetIconListQuery = z.infer<typeof iconSetIconListQuerySchema>
export type IconSetPrefixParam = z.infer<typeof iconSetPrefixParamSchema>
export type IconSetIconItem = z.infer<typeof iconSetIconItemSchema>
export type BuiltinIconSetItem = z.infer<typeof builtinIconSetItemSchema>
export type BuiltinIconSetListResponse = z.infer<typeof builtinIconSetListResponseSchema>
export type BuiltinIconListResponse = z.infer<typeof builtinIconListResponseSchema>
export type CustomIconSet = z.infer<typeof customIconSetSchema>
export type CustomIconSetListResponse = z.infer<typeof customIconSetListResponseSchema>
export type CustomIconParam = z.infer<typeof customIconParamSchema>
export type CustomIconItem = z.infer<typeof customIconItemSchema>
export type CustomIconListResponse = z.infer<typeof customIconListResponseSchema>
export type CustomIconSetFormInput = z.infer<typeof customIconSetFormSchema>
export type CustomIconSetCreateInput = z.infer<typeof customIconSetCreateSchema>
export type CustomIconSetUpdateInput = z.infer<typeof customIconSetUpdateSchema>
export type CustomIconDuplicateStrategy = z.infer<typeof customIconDuplicateStrategySchema>
export type IconSetRenameIconInput = z.infer<typeof iconSetRenameIconSchema>
export type CustomIconUploadSkipped = z.infer<typeof customIconUploadSkippedSchema>
export type CustomIconUploadFailed = z.infer<typeof customIconUploadFailedSchema>
export type CustomIconUploadResponse = z.infer<typeof customIconUploadResponseSchema>
