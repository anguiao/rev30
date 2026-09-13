import { z } from 'zod'

export const errorResponseSchema = z.object({
  code: z
    .enum(['INVALID_ICON_CURSOR', 'ICON_SEARCH_PREPARING', 'ICON_SEARCH_UNAVAILABLE'])
    .optional(),
  field: z.string().optional(),
  message: z.string(),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>
