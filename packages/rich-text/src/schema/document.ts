import { z } from 'zod'

export const richTextDocumentSchema = z.looseObject({
  type: z.literal('doc'),
})

export function hasRichTextContent(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>

  if ('text' in record) {
    return typeof record.text === 'string' && record.text.trim().length > 0
  }

  if ('content' in record) {
    return Array.isArray(record.content) && record.content.some(hasRichTextContent)
  }

  return 'attrs' in record && record.attrs !== null && record.attrs !== undefined
}

export type RichTextDocument = z.infer<typeof richTextDocumentSchema>
