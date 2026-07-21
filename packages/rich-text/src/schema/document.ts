import { z } from 'zod'

export const richTextDocumentEnvelopeSchema = z.looseObject({
  type: z.literal('doc'),
})

const visibleAtomNodeTypes = new Set(['horizontalRule', 'image'])

export function hasRichTextContent(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>

  if (record.type === 'text') {
    return typeof record.text === 'string' && record.text.trim().length > 0
  }

  if (typeof record.type === 'string' && visibleAtomNodeTypes.has(record.type)) {
    return true
  }

  return Array.isArray(record.content) && record.content.some(hasRichTextContent)
}

export type RichTextDocument = z.infer<typeof richTextDocumentEnvelopeSchema>
