import {
  type AttachmentListQuery,
  attachmentSchema,
  attachmentListQuerySchema,
  attachmentListResponseSchema,
  attachmentSignedUrlInputSchema,
  attachmentSignedUrlSchema,
  attachmentUsageSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Db } from '../../db'
import { requireAccess } from '../../middleware/access'
import type { AuthEnv } from '../../middleware/auth'
import {
  AttachmentFileTooLargeError,
  AttachmentNotFoundError,
  AttachmentSignedUrlInvalidError,
  AttachmentTypeUnsupportedError,
  AttachmentUploadRequestError,
} from './errors'
import { createAttachmentService } from './service'
import { handleAttachmentUpload } from './upload'

const attachmentIdParamSchema = attachmentSchema.pick({ id: true })
const attachmentUploadQuerySchema = z.object({
  usage: attachmentUsageSchema,
})
const attachmentContentQuerySchema = z.object({
  token: z.string().trim().min(1),
})
const attachmentListRequestQuerySchema = attachmentListQuerySchema
  .optional()
  .transform((query) => query ?? attachmentListQuerySchema.parse({}))

const attachmentIdValidator = zValidator('param', attachmentIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '附件 ID 无效' }, 400)
  }
})

const attachmentSignedUrlBodyValidator = zValidator(
  'json',
  attachmentSignedUrlInputSchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '请求体无效' }, 400)
    }
  },
)

const attachmentUploadQueryValidator = zValidator(
  'query',
  attachmentUploadQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '上传用途无效' }, 400)
    }
  },
)

const attachmentContentQueryValidator = zValidator(
  'query',
  attachmentContentQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '附件链接已失效' }, 400)
    }
  },
)
const attachmentListQueryValidator = zValidator(
  'query',
  attachmentListRequestQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)

function attachmentErrorResponse(error: unknown, c: Context) {
  if (
    error instanceof AttachmentUploadRequestError ||
    error instanceof AttachmentFileTooLargeError ||
    error instanceof AttachmentTypeUnsupportedError
  ) {
    return c.json({ message: error.message }, 400)
  }

  if (error instanceof AttachmentSignedUrlInvalidError) {
    return c.json({ message: error.message }, 403)
  }

  if (error instanceof AttachmentNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

export function createAttachmentRoutes(database: Db) {
  const service = createAttachmentService(database)
  const app = new Hono<AuthEnv>()

  app.onError((error, c) => attachmentErrorResponse(error, c))

  return app
    .get('/', requireAccess('content:attachment:list'), attachmentListQueryValidator, async (c) => {
      const query: AttachmentListQuery = c.req.valid('query')

      return c.json(attachmentListResponseSchema.parse(await service.list(query)))
    })
    .post('/', attachmentUploadQueryValidator, async (c) => {
      const { usage } = c.req.valid('query')
      const attachment = await handleAttachmentUpload(c.req.raw, (file) =>
        service.upload({
          body: file.body,
          originalName: file.originalName,
          usage,
          userId: c.get('currentUser').id,
        }),
      )

      return c.json(attachmentSchema.parse(attachment), 201)
    })
    .get('/:id', requireAccess('content:attachment:list'), attachmentIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(attachmentSchema.parse(await service.get(id)))
    })
    .post('/:id/signed-url', attachmentIdValidator, attachmentSignedUrlBodyValidator, async (c) => {
      const { id } = c.req.valid('param')
      const body = c.req.valid('json')

      return c.json(
        attachmentSignedUrlSchema.parse(
          await service.createSignedUrl(id, {
            disposition: body.disposition,
          }),
        ),
      )
    })
    .delete(
      '/:id',
      requireAccess('content:attachment:delete'),
      attachmentIdValidator,
      async (c) => {
        const { id } = c.req.valid('param')

        await service.delete(id)

        return c.body(null, 204)
      },
    )
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
