import type { z } from 'zod'

export function hasAnyDefinedValue(value: object) {
  return Object.values(value).some((fieldValue) => fieldValue !== undefined)
}

export function ensureUniqueItems<T>(message: string) {
  return (value: T[], context: z.RefinementCtx) => {
    const seenItems = new Set<T>()

    for (const item of value) {
      if (seenItems.has(item)) {
        context.addIssue({
          code: 'custom',
          message,
        })
        return
      }

      seenItems.add(item)
    }
  }
}
