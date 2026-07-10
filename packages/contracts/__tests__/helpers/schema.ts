import { expect } from 'vitest'
import type { z } from 'zod'

export function expectZodIssue(
  result: z.ZodSafeParseResult<unknown>,
  expected: {
    message: string
    path?: PropertyKey[]
  },
) {
  expect(result.success).toBe(false)

  if (result.success) {
    throw new Error('Expected schema parsing to fail')
  }

  expect(result.error.issues).toContainEqual(expect.objectContaining(expected))

  return result.error
}

export function testUuid(index: number) {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
}
