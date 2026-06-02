import {
  type AttachmentListQuery,
  attachmentSchema,
  attachmentContentUrlInputSchema,
  attachmentContentUrlSchema,
  attachmentListQuerySchema,
  attachmentListResponseSchema,
  attachmentUploadSessionCompleteInputSchema,
  attachmentUploadSessionCreateInputSchema,
  attachmentUploadSessionSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { z } from 'zod'
import type { Db } from '../../db'
import { requireAccess } from '../../middleware/access'
import type { AuthEnv } from '../../middleware/auth'
import { getAttachmentTokenCookie } from '../auth/cookies'
import { readAuthConfig } from '../auth/config'
import { AuthInvalidAttachmentTokenError } from '../auth/errors'
import { createAuthService } from '../auth/service'
import {
  AttachmentContentUnauthorizedError,
  AttachmentContentUrlUnsupportedError,
  AttachmentFileTooLargeError,
  AttachmentNotFoundError,
  AttachmentContentUrlInvalidError,
  AttachmentTypeUnsupportedError,
  AttachmentUploadSessionInvalidError,
  AttachmentUploadSessionNotReadyError,
  AttachmentUploadUrlInvalidError,
  AttachmentUploadRequestError,
} from './errors'
import { createAttachmentService } from './service'

const attachmentIdParamSchema = attachmentSchema.pick({ id: true })
const attachmentUploadSessionIdParamSchema = z.object({
  uploadId: z.uuid(),
})
const attachmentContentQuerySchema = z.object({
  token: z.string().trim().min(1).optional(),
})
const attachmentUploadContentQuerySchema = z.object({
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

const attachmentContentUrlBodyValidator = zValidator(
  'json',
  attachmentContentUrlInputSchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '请求体无效' }, 400)
    }
  },
)

const attachmentUploadSessionIdValidator = zValidator(
  'param',
  attachmentUploadSessionIdParamSchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '上传会话 ID 无效' }, 400)
    }
  },
)

const attachmentUploadSessionCreateBodyValidator = zValidator(
  'json',
  attachmentUploadSessionCreateInputSchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '请求体无效' }, 400)
    }
  },
)

const attachmentUploadSessionCompleteBodyValidator = zValidator(
  'json',
  attachmentUploadSessionCompleteInputSchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '请求体无效' }, 400)
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
const attachmentUploadContentQueryValidator = zValidator(
  'query',
  attachmentUploadContentQuerySchema,
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
    error instanceof AttachmentContentUrlUnsupportedError ||
    error instanceof AttachmentTypeUnsupportedError
  ) {
    return c.json({ message: error.message }, 400)
  }

  if (error instanceof AttachmentUploadUrlInvalidError) {
    return c.json({ message: error.message }, 403)
  }

  if (
    error instanceof AttachmentContentUnauthorizedError ||
    error instanceof AttachmentContentUrlInvalidError
  ) {
    return c.json({ message: error.message }, 401)
  }

  if (
    error instanceof AttachmentUploadSessionInvalidError ||
    error instanceof AttachmentUploadSessionNotReadyError
  ) {
    return c.json({ message: error.message }, 400)
  }

  if (error instanceof AttachmentNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

export function createAttachmentRoutes(database: Db, authMiddleware: MiddlewareHandler<AuthEnv>) {
  const service = createAttachmentService(database)
  const authService = createAuthService(database, readAuthConfig())
  const app = new Hono<AuthEnv>()

  app.onError((error, c) => attachmentErrorResponse(error, c))

  return app
    .put(
      '/uploads/:uploadId/content',
      attachmentUploadSessionIdValidator,
      attachmentUploadContentQueryValidator,
      async (c) => {
        const { uploadId } = c.req.valid('param')
        const { token } = c.req.valid('query')

        await service.uploadSessionContent({
          body: c.req.raw.body,
          token,
          uploadId,
        })

        return c.body(null, 204)
      },
    )
    .get('/:id/content', attachmentIdValidator, attachmentContentQueryValidator, async (c) => {
      const { id } = c.req.valid('param')
      const { token } = c.req.valid('query')
      const content = await service.readContent(id, {
        signedToken: token,
        verifyAuthenticatedRead: async () => {
          try {
            return await authService.verifyAttachmentReadToken(getAttachmentTokenCookie(c))
          } catch (error) {
            if (error instanceof AuthInvalidAttachmentTokenError) {
              throw new AttachmentContentUnauthorizedError()
            }

            throw error
          }
        },
      })

      return c.newResponse(content.body, 200, content.headers)
    })
    .use('*', authMiddleware)
    .get('/', requireAccess('content:attachment:list'), attachmentListQueryValidator, async (c) => {
      const query: AttachmentListQuery = c.req.valid('query')

      return c.json(attachmentListResponseSchema.parse(await service.list(query)))
    })
    .post('/uploads', attachmentUploadSessionCreateBodyValidator, async (c) => {
      const body = c.req.valid('json')
      const session = await service.createUploadSession({
        ...body,
        userId: c.get('currentUser').id,
      })

      return c.json(attachmentUploadSessionSchema.parse(session), 201)
    })
    .post(
      '/uploads/:uploadId/complete',
      attachmentUploadSessionIdValidator,
      attachmentUploadSessionCompleteBodyValidator,
      async (c) => {
        const { uploadId } = c.req.valid('param')
        const attachment = await service.completeUploadSession({
          uploadId,
          userId: c.get('currentUser').id,
        })

        return c.json(attachmentSchema.parse(attachment), 201)
      },
    )
    .get('/:id', requireAccess('content:attachment:list'), attachmentIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(attachmentSchema.parse(await service.get(id)))
    })
    .post(
      '/:id/content-url',
      attachmentIdValidator,
      attachmentContentUrlBodyValidator,
      async (c) => {
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')

        return c.json(
          attachmentContentUrlSchema.parse(
            await service.createContentUrl(id, {
              disposition: body.disposition,
            }),
          ),
        )
      },
    )
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
