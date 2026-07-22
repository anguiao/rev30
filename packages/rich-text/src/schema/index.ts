import { z } from 'zod'

export const richTextDocumentEnvelopeSchema = z.looseObject({
  type: z.literal('doc'),
})

export type RichTextDocument = z.infer<typeof richTextDocumentEnvelopeSchema>
