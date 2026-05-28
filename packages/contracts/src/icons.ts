import { z } from 'zod'

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

export type IconDataParam = z.infer<typeof iconDataParamSchema>
export type IconDataQuery = z.infer<typeof iconDataQuerySchema>
export type IconSearchQuery = z.infer<typeof iconSearchQuerySchema>
export type IconSearchItem = z.infer<typeof iconSearchItemSchema>
export type IconSearchResponse = z.infer<typeof iconSearchResponseSchema>
