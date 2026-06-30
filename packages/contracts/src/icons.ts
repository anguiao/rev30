import { z } from 'zod'
import { hasAnyDefinedValue } from './common/refinements'

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
const prettyQuerySchema = z
  .string()
  .optional()
  .transform((value) => value !== undefined && value !== '')

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
  pretty: prettyQuerySchema,
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
const iconSetKeywordMaxLength = 120
const iconSetPageSizeMax = 100
const iconSetIconPageSizeDefault = 80
const customIconSetNameMaxLength = 80
const customIconSetDescriptionMaxLength = 300

const iconSetPrefixSchema = z.string().regex(iconSetPrefixPattern, '图标集前缀无效')
const iconSetNameSchema = z.string().regex(iconSetPrefixPattern, '图标名称无效')

function pageSchema(defaultValue: number) {
  return z.coerce
    .number('页码必须是数字')
    .int('页码必须是整数')
    .min(1, '页码不能小于 1')
    .default(defaultValue)
}

function pageSizeSchema(defaultValue: number) {
  return z.coerce
    .number('每页数量必须是数字')
    .int('每页数量必须是整数')
    .min(1, '每页数量不能小于 1')
    .max(iconSetPageSizeMax, '每页数量不能超过 100')
    .default(defaultValue)
}

const iconSetKeywordSchema = z
  .string()
  .optional()
  .default('')
  .transform((value) => value.trim())
  .pipe(z.string().max(iconSetKeywordMaxLength, '搜索关键词过长'))
  .transform((value) => (value === '' ? undefined : value))

const iconSetListQueryBaseSchema = z.object({
  keyword: iconSetKeywordSchema,
})

const iconSetIconListQueryBaseSchema = iconSetListQueryBaseSchema.extend({
  prefix: iconSetPrefixSchema.optional(),
  page: pageSchema(1),
  pageSize: pageSizeSchema(iconSetIconPageSizeDefault),
})

const customIconSetDescriptionInputSchema = z
  .union([
    z.string().trim().max(customIconSetDescriptionMaxLength, '图标集描述不能超过 300 个字符'),
    z.null(),
  ])
  .optional()
  .transform((value) => value ?? null)

const customIconSetUpdateDescriptionSchema = z
  .union([
    z.string().trim().max(customIconSetDescriptionMaxLength, '图标集描述不能超过 300 个字符'),
    z.null(),
  ])
  .optional()

export const iconSetListQuerySchema = iconSetListQueryBaseSchema.transform(({ keyword }) => ({
  keyword,
}))

export const iconSetIconListQuerySchema = iconSetIconListQueryBaseSchema.transform(
  ({ keyword, prefix, page, pageSize }) => ({
    keyword,
    prefix,
    page,
    pageSize,
  }),
)

export const iconSetPrefixParamSchema = z.object({
  prefix: iconSetPrefixSchema,
})

export const iconSetSvgIconNameParamSchema = z.object({
  name: iconSetNameSchema,
})

export const builtinIconSetItemSchema = z.object({
  prefix: iconSetPrefixSchema,
  name: z.string().min(1),
  total: z.number().int().min(0),
})

export const builtinIconSetListResponseSchema = z.object({
  list: builtinIconSetItemSchema.array(),
  total: z.number().int().min(0),
})

export const iconSetRenderableIconSchema = z.object({
  icon: z.string().regex(iconifyIconNamePattern, '图标名称无效'),
  prefix: iconSetPrefixSchema,
  name: iconSetNameSchema,
  setName: z.string().min(1),
  body: z.string().min(1),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
})

export const builtinIconListResponseSchema = z.object({
  list: iconSetRenderableIconSchema.array(),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export const customIconSetSchema = z.object({
  prefix: iconSetPrefixSchema,
  name: z.string().trim().min(1, '请输入图标集名称').max(customIconSetNameMaxLength),
  description: z.string().nullable(),
  iconCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const customIconSetListResponseSchema = z.object({
  list: customIconSetSchema.array(),
  total: z.number().int().min(0),
})

export const customIconItemSchema = iconSetRenderableIconSchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const customIconListResponseSchema = z.object({
  list: customIconItemSchema.array(),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export const customIconSetCreateSchema = z.object({
  prefix: iconSetPrefixSchema,
  name: z.string().trim().min(1, '请输入图标集名称').max(customIconSetNameMaxLength),
  description: customIconSetDescriptionInputSchema,
})

export const customIconSetUpdateSchema = z
  .object({
    name: z.string().trim().min(1, '请输入图标集名称').max(customIconSetNameMaxLength).optional(),
    description: customIconSetUpdateDescriptionSchema,
  })
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
export type IconSetListQuery = z.infer<typeof iconSetListQuerySchema>
export type IconSetIconListQuery = z.infer<typeof iconSetIconListQuerySchema>
export type IconSetPrefixParam = z.infer<typeof iconSetPrefixParamSchema>
export type IconSetSvgIconNameParam = z.infer<typeof iconSetSvgIconNameParamSchema>
export type BuiltinIconSetItem = z.infer<typeof builtinIconSetItemSchema>
export type BuiltinIconSetListResponse = z.infer<typeof builtinIconSetListResponseSchema>
export type IconSetRenderableIcon = z.infer<typeof iconSetRenderableIconSchema>
export type BuiltinIconListResponse = z.infer<typeof builtinIconListResponseSchema>
export type CustomIconSet = z.infer<typeof customIconSetSchema>
export type CustomIconSetListResponse = z.infer<typeof customIconSetListResponseSchema>
export type CustomIconItem = z.infer<typeof customIconItemSchema>
export type CustomIconListResponse = z.infer<typeof customIconListResponseSchema>
export type CustomIconSetCreateInput = z.infer<typeof customIconSetCreateSchema>
export type CustomIconSetUpdateInput = z.infer<typeof customIconSetUpdateSchema>
export type CustomIconDuplicateStrategy = z.infer<typeof customIconDuplicateStrategySchema>
export type IconSetRenameIconInput = z.infer<typeof iconSetRenameIconSchema>
export type CustomIconUploadSkipped = z.infer<typeof customIconUploadSkippedSchema>
export type CustomIconUploadFailed = z.infer<typeof customIconUploadFailedSchema>
export type CustomIconUploadResponse = z.infer<typeof customIconUploadResponseSchema>
