import {
  customIconDuplicateStrategySchema,
  customIconParamSchema,
  customIconSetCreateSchema,
  customIconSetUpdateSchema,
  iconSetIconListQuerySchema,
  iconSetListQuerySchema,
  iconSetPrefixParamSchema,
  iconSetRenameIconSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Db } from '../../../../db'
import { requireAccess } from '../../../../middleware/access'
import { createBodyLimit } from '../../../../middleware/body-limit'
import { markOperationAudit, type OperationAuditRouteEnv } from '../../../ops/operation-logs/audit'
import {
  CustomIconConflictError,
  CustomIconNotFoundError,
  CustomIconSetConflictError,
  CustomIconSetNotFoundError,
  CustomSvgInvalidError,
} from './errors'
import { createCustomIconSetService } from './service'

const iconSetListQueryValidator = zValidator('query', iconSetListQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '查询参数无效' }, 400)
  }
})

const iconSetIconListQueryValidator = zValidator(
  'query',
  iconSetIconListQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)

const iconSetCreateBodyValidator = zValidator('json', customIconSetCreateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

const iconSetUpdateBodyValidator = zValidator('json', customIconSetUpdateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

const iconSetRenameBodyValidator = zValidator('json', iconSetRenameIconSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

const iconSetParamValidator = zValidator('param', iconSetPrefixParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '图标集参数无效' }, 400)
  }
})

const customIconParamValidator = zValidator('param', customIconParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '图标参数无效' }, 400)
  }
})

const uploadFileSchema = z.instanceof(File)
const customIconUploadBodyLimit = createBodyLimit(5 * 1024 * 1024)

const iconUploadFormSchema = z.object({
  duplicateStrategy: z.preprocess(
    (value) => (value === undefined || value === '' ? 'skip' : value),
    customIconDuplicateStrategySchema,
  ),
  files: z
    .union([uploadFileSchema, uploadFileSchema.array()])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .pipe(uploadFileSchema.array().min(1)),
})

const iconUploadFormValidator = zValidator('form', iconUploadFormSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

function customIconErrorResponse(error: unknown, c: Context) {
  if (error instanceof CustomIconSetConflictError || error instanceof CustomIconConflictError) {
    return c.json({ message: error.message }, 409)
  }

  if (error instanceof CustomIconSetNotFoundError || error instanceof CustomIconNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  if (error instanceof CustomSvgInvalidError) {
    return c.json({ message: error.message }, 400)
  }

  throw error
}

export function createCustomIconSetRoutes(database: Db) {
  const service = createCustomIconSetService(database)
  const app = new Hono<OperationAuditRouteEnv>()

  app.onError((error, c) => customIconErrorResponse(error, c))

  return app
    .get('/', requireAccess('content:icon-set:list'), iconSetListQueryValidator, async (c) => {
      return c.json(await service.list(c.req.valid('query')))
    })
    .post('/', requireAccess('content:icon-set:create'), iconSetCreateBodyValidator, async (c) => {
      const body = c.req.valid('json')

      markOperationAudit(c, 'content:icon-set:create', {
        targetKey: body.prefix,
        targetLabel: body.name,
      })

      return c.json(await service.create(body), 201)
    })
    .get(
      '/icons',
      requireAccess('content:icon-set:list'),
      iconSetIconListQueryValidator,
      async (c) => {
        return c.json(await service.listIcons(c.req.valid('query')))
      },
    )
    .post(
      '/:prefix/icons',
      requireAccess('content:icon-set:create'),
      iconSetParamValidator,
      customIconUploadBodyLimit,
      iconUploadFormValidator,
      async (c) => {
        const { prefix } = c.req.valid('param')
        const form = c.req.valid('form')

        markOperationAudit(c, 'content:icon:upload', { targetKey: prefix })

        const files = await Promise.all(
          form.files.map(async (file) => ({
            filename: file.name,
            content: await file.text(),
          })),
        )

        return c.json(
          await service.uploadIcons(prefix, {
            duplicateStrategy: form.duplicateStrategy,
            files,
          }),
        )
      },
    )
    .patch(
      '/:prefix/icons/:name',
      requireAccess('content:icon-set:update'),
      customIconParamValidator,
      iconSetRenameBodyValidator,
      async (c) => {
        const { prefix, name } = c.req.valid('param')
        const body = c.req.valid('json')

        markOperationAudit(c, 'content:icon:rename', {
          targetKey: `${prefix}:${name}`,
          targetLabel: body.name,
        })

        return c.json(await service.renameIcon(prefix, name, body))
      },
    )
    .delete(
      '/:prefix/icons/:name',
      requireAccess('content:icon-set:delete'),
      customIconParamValidator,
      async (c) => {
        const { prefix, name } = c.req.valid('param')

        markOperationAudit(c, 'content:icon:delete', { targetKey: `${prefix}:${name}` })

        await service.deleteIcon(prefix, name)

        return c.body(null, 204)
      },
    )
    .get(
      '/:prefix/export',
      requireAccess('content:icon-set:export'),
      iconSetParamValidator,
      async (c) => {
        const { prefix } = c.req.valid('param')

        markOperationAudit(c, 'content:icon-set:export', { targetKey: prefix })

        const exported = await service.exportIconSet(prefix)

        c.header('content-type', 'application/json; charset=utf-8')
        c.header('content-disposition', `attachment; filename="${prefix}.json"`)

        return c.body(JSON.stringify(exported, null, 2))
      },
    )
    .get('/:prefix', requireAccess('content:icon-set:list'), iconSetParamValidator, async (c) => {
      const { prefix } = c.req.valid('param')

      return c.json(await service.get(prefix))
    })
    .patch(
      '/:prefix',
      requireAccess('content:icon-set:update'),
      iconSetParamValidator,
      iconSetUpdateBodyValidator,
      async (c) => {
        const { prefix } = c.req.valid('param')
        const body = c.req.valid('json')

        markOperationAudit(c, 'content:icon-set:update', {
          targetKey: prefix,
          ...(body.name === undefined ? {} : { targetLabel: body.name }),
        })

        return c.json(await service.update(prefix, body))
      },
    )
    .delete(
      '/:prefix',
      requireAccess('content:icon-set:delete'),
      iconSetParamValidator,
      async (c) => {
        const { prefix } = c.req.valid('param')

        markOperationAudit(c, 'content:icon-set:delete', { targetKey: prefix })

        await service.delete(prefix)

        return c.body(null, 204)
      },
    )
}
