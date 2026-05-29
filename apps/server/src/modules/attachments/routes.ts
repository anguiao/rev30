import {
  attachmentSchema,
  attachmentSignedUrlInputSchema,
  attachmentSignedUrlSchema,
  attachmentUsageSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { FormFieldError } from '../../core/errors'
import type { Db } from '../../db'
import type { AuthEnv } from '../../middleware/auth'
import {
  AttachmentInvalidUsageError,
  AttachmentMissingFileError,
  AttachmentNotFoundError,
  AttachmentSignedUrlInvalidError,
} from './errors'
import { ATTACHMENT_UPLOAD_BODY_MAX_SIZE_BYTES } from './policy'
import { createAttachmentService } from './service'

const attachmentIdParamSchema = attachmentSchema.pick({ id: true })
const attachmentContentQuerySchema = z.object({
  token: z.string({ error: '附件链接已失效' }).trim().min(1, '附件链接已失效'),
})

const attachmentIdValidator = zValidator('param', attachmentIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '附件 ID 无效' }, 400)
  }
})

const attachmentContentQueryValidator = zValidator(
  'query',
  attachmentContentQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json(
        {
          field: 'token',
          message: result.error.issues[0]?.message ?? '附件链接已失效',
        },
        400,
      )
    }
  },
)

async function readAttachmentSignedUrlBody(c: Context) {
  let input: unknown

  try {
    input = await c.req.json()
  } catch {
    return c.json({ message: '请求体无效' }, 400)
  }

  const result = attachmentSignedUrlInputSchema.safeParse(input)

  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }

  return result.data
}

function attachmentErrorResponse(error: unknown, c: Context) {
  if (error instanceof FormFieldError) {
    return c.json({ field: error.field, message: error.message }, 400)
  }

  if (error instanceof AttachmentSignedUrlInvalidError) {
    return c.json({ message: error.message }, 403)
  }

  if (error instanceof AttachmentNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

function readUploadFormData(form: Record<string, string | File | (string | File)[]>) {
  const file = form.file
  const usage = form.usage

  if (!(file instanceof File)) {
    throw new AttachmentMissingFileError()
  }

  if (typeof usage !== 'string') {
    throw new AttachmentInvalidUsageError()
  }

  const usageResult = attachmentUsageSchema.safeParse(usage)

  if (!usageResult.success) {
    throw new AttachmentInvalidUsageError()
  }

  return {
    file,
    usage: usageResult.data,
  }
}

function getAttachmentAccessSubject(c: Context<AuthEnv>) {
  return {
    isAdmin: c.get('isAdmin'),
    userId: c.get('currentUser').id,
  }
}

export function createAttachmentRoutes(database: Db) {
  const service = createAttachmentService(database)
  const app = new Hono<AuthEnv>()

  app.onError((error, c) => attachmentErrorResponse(error, c))

  return app
    .post(
      '/',
      bodyLimit({
        maxSize: ATTACHMENT_UPLOAD_BODY_MAX_SIZE_BYTES,
        onError: (c) => c.json({ field: 'file', message: '文件大小不能超过 20MB' }, 413),
      }),
      async (c) => {
        const { file, usage } = readUploadFormData(await c.req.parseBody())
        const attachment = await service.upload({
          file,
          usage,
          userId: c.get('currentUser').id,
        })

        return c.json(attachmentSchema.parse(attachment), 201)
      },
    )
    .get('/:id', attachmentIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(attachmentSchema.parse(await service.get(id, getAttachmentAccessSubject(c))))
    })
    .post('/:id/signed-url', attachmentIdValidator, async (c) => {
      const { id } = c.req.valid('param')
      const body = await readAttachmentSignedUrlBody(c)

      if (body instanceof Response) {
        return body
      }

      return c.json(
        attachmentSignedUrlSchema.parse(
          await service.createSignedUrl(id, {
            disposition: body.disposition,
            origin: new URL(c.req.url).origin,
            subject: getAttachmentAccessSubject(c),
          }),
        ),
      )
    })
    .delete('/:id', attachmentIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      await service.delete(id, getAttachmentAccessSubject(c))

      return c.body(null, 204)
    })
}

export function createAttachmentContentRoutes(database: Db) {
  const service = createAttachmentService(database)
  const app = new Hono()

  app.onError((error, c) => attachmentErrorResponse(error, c))

  return app.get(
    '/:id/content',
    attachmentIdValidator,
    attachmentContentQueryValidator,
    async (c) => {
      const { id } = c.req.valid('param')
      const { token } = c.req.valid('query')
      const content = await service.readContent(id, token)

      return c.newResponse(content.body, 200, content.headers)
    },
  )
}
