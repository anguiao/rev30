import { z } from 'zod'

export const richTextDocumentSchema = z.looseObject({
  type: z.literal('doc'),
})

export function hasNonBlankRichText(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  if ('text' in value && typeof value.text === 'string' && value.text.trim().length > 0) {
    return true
  }

  if (!('content' in value) || !Array.isArray(value.content)) {
    return false
  }

  return value.content.some(hasNonBlankRichText)
}

export type RichTextDocument = z.infer<typeof richTextDocumentSchema>
