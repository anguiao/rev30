import { z } from 'zod'

export const errorResponseSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>
