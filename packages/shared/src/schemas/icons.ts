import { z } from 'zod'

const iconFileExtension = '.json'
const iconFilenamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/
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
  icons: z.string().transform((value) => value.split(',')),
  pretty: prettyQuerySchema,
})

const iconSearchLimitDefault = 60
const iconSearchLimitMax = 100
const iconNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/

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
    .transform((value) => value.trim()),
  limit: iconSearchLimitSchema,
})

export const iconSearchItemSchema = z.object({
  icon: z.string().regex(iconNamePattern, '图标名称无效'),
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
