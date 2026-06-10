import { z } from 'zod'

export const richTextDocumentSchema = z.looseObject({
  type: z.literal('doc'),
})

function hasMediaContent(value: Record<string, unknown>): boolean {
  if (value.type !== 'image' || typeof value.attrs !== 'object' || value.attrs === null) {
    return false
  }

  const attrs = value.attrs as Record<string, unknown>

  return typeof attrs.src === 'string' && attrs.src.trim().length > 0
}

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

  return hasMediaContent(record)
}

export type RichTextDocument = z.infer<typeof richTextDocumentSchema>
