import { richTextDocumentEnvelopeSchema } from '@rev30/rich-text/schema'
import { z } from 'zod'

export const RICH_TEXT_DEMO_IMAGE_MAX_SIZE_BYTES = 1024 * 1024
export const RICH_TEXT_DEMO_PREVIEW_MAX_BODY_SIZE_BYTES = 5 * 1024 * 1024

export const richTextDemoPreviewInputSchema = z
  .object({
    contentJson: richTextDocumentEnvelopeSchema,
  })
  .strict()

export const richTextDemoPreviewResponseSchema = z.object({
  contentJson: richTextDocumentEnvelopeSchema,
  contentText: z.string(),
  contentHtml: z.string(),
})

export type RichTextDemoPreviewInput = z.infer<typeof richTextDemoPreviewInputSchema>
export type RichTextDemoPreviewResponse = z.infer<typeof richTextDemoPreviewResponseSchema>
