import {
  RICH_TEXT_DEMO_PREVIEW_MAX_BODY_SIZE_BYTES,
  type RichTextDemoPreviewInput,
  richTextDemoPreviewInputSchema,
  richTextDemoPreviewResponseSchema,
} from '@rev30/contracts'
import { RichTextContentInvalidError } from '@rev30/rich-text/server'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { requireAccess } from '../../../middleware/access'
import type { AuthEnv } from '../../../middleware/auth'
import { createBodyLimit } from '../../../middleware/body-limit'
import { deriveRichTextDemoContent } from './content'

const previewBodyValidator = zValidator('json', richTextDemoPreviewInputSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

function richTextDemoErrorResponse(error: unknown, c: Context) {
  if (error instanceof RichTextContentInvalidError) {
    return c.json({ field: 'contentJson', message: '富文本内容无效' }, 400)
  }

  throw error
}

export const richTextDemoRoutes = new Hono<AuthEnv>()
  .onError((error, c) => richTextDemoErrorResponse(error, c))
  .post(
    '/preview',
    requireAccess('demo:rich-text:preview'),
    createBodyLimit(RICH_TEXT_DEMO_PREVIEW_MAX_BODY_SIZE_BYTES),
    previewBodyValidator,
    (c) => {
      const body: RichTextDemoPreviewInput = c.req.valid('json')
      const content = deriveRichTextDemoContent(body.contentJson)

      return c.json(
        richTextDemoPreviewResponseSchema.parse({
          contentJson: content.json,
          contentText: content.text,
          contentHtml: content.html,
        }),
      )
    },
  )
