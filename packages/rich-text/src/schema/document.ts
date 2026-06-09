import { z } from 'zod'

export const richTextDocumentSchema = z.looseObject({
  type: z.literal('doc'),
})

export function hasRichTextContent(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  if ('text' in value) {
    return typeof value.text === 'string' && value.text.trim().length > 0
  }

  if ('content' in value) {
    return Array.isArray(value.content) && value.content.some(hasRichTextContent)
  }

  return 'attrs' in value && value.attrs !== null && value.attrs !== undefined
}

export type RichTextDocument = z.infer<typeof richTextDocumentSchema>
