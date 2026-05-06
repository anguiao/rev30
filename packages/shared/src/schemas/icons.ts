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

export type IconDataParam = z.infer<typeof iconDataParamSchema>
export type IconDataQuery = z.infer<typeof iconDataQuerySchema>
