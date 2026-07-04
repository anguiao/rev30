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
import type { AuthEnv } from '../../../../middleware/auth'
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
  const app = new Hono<AuthEnv>()

  app.onError((error, c) => customIconErrorResponse(error, c))

  return app
    .get('/', requireAccess('content:icon-set:list'), iconSetListQueryValidator, async (c) => {
      return c.json(await service.list(c.req.valid('query')))
    })
    .post('/', requireAccess('content:icon-set:create'), iconSetCreateBodyValidator, async (c) => {
      return c.json(await service.create(c.req.valid('json')), 201)
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
      iconUploadFormValidator,
      async (c) => {
        const { prefix } = c.req.valid('param')
        const form = c.req.valid('form')
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

        return c.json(await service.renameIcon(prefix, name, c.req.valid('json')))
      },
    )
    .delete(
      '/:prefix/icons/:name',
      requireAccess('content:icon-set:delete'),
      customIconParamValidator,
      async (c) => {
        const { prefix, name } = c.req.valid('param')

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

        return c.json(await service.update(prefix, c.req.valid('json')))
      },
    )
    .delete(
      '/:prefix',
      requireAccess('content:icon-set:delete'),
      iconSetParamValidator,
      async (c) => {
        const { prefix } = c.req.valid('param')

        await service.delete(prefix)

        return c.body(null, 204)
      },
    )
}
