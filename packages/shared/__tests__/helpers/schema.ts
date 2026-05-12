import { z } from 'zod'

export function prettifyZodError(result: { success: false; error: z.ZodError }) {
  return z.prettifyError(result.error)
}

export function testUuid(index: number) {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
}
