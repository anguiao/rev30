import type { JSONContent } from '@tiptap/core'
import { z } from 'zod'

export const richTextDocumentEnvelopeSchema = z.looseObject({
  type: z.literal('doc'),
})

export type RichTextJsonNode = JSONContent
export type RichTextDocument = z.infer<typeof richTextDocumentEnvelopeSchema>
