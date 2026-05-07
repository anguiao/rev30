import { z } from 'zod'

export const errorMessageSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
})

export type ErrorMessage = z.infer<typeof errorMessageSchema>
