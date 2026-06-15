import {
  customIconDuplicateStrategySchema,
  customIconSetCreateSchema,
  customIconSetUpdateSchema,
  iconSetIconListQuerySchema,
  iconSetListQuerySchema,
  iconSetPrefixParamSchema,
  iconSetRenameIconSchema,
  iconSetSvgIconNameParamSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../../db'
import { requireAccess } from '../../../../middleware/access'
import type { AuthEnv } from '../../../../middleware/auth'
import { loadIconCollections } from '../../search/collections'
import {
  CustomIconConflictError,
  CustomIconNotFoundError,
  CustomIconSetConflictError,
  CustomIconSetNotFoundError,
  CustomSvgInvalidError,
} from './errors'
import { createCustomIconSetService } from './service'

const iconSetParamSchema = iconSetPrefixParamSchema
const customIconParamSchema = iconSetPrefixParamSchema.extend({
  name: iconSetSvgIconNameParamSchema.shape.name,
})

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

const iconSetParamValidator = zValidator('param', iconSetParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '图标集参数无效' }, 400)
  }
})

const customIconParamValidator = zValidator('param', customIconParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '图标参数无效' }, 400)
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

function isFormRequest(contentType: string | undefined) {
  if (!contentType) {
    return false
  }

  const normalizedContentType = contentType.toLowerCase()

  return (
    normalizedContentType.startsWith('multipart/form-data') ||
    normalizedContentType.startsWith('application/x-www-form-urlencoded')
  )
}

async function parseUploadInput(formData: FormData) {
  const rawDuplicateStrategy = formData.get('duplicateStrategy')
  const duplicateStrategyResult = customIconDuplicateStrategySchema.safeParse(
    typeof rawDuplicateStrategy === 'string' && rawDuplicateStrategy !== ''
      ? rawDuplicateStrategy
      : 'skip',
  )

  if (!duplicateStrategyResult.success) {
    return {
      error: { message: '请求体无效' } as const,
    }
  }

  const fileEntries = formData.getAll('files')
  const files = fileEntries.filter((entry): entry is File => entry instanceof File)

  if (files.length !== fileEntries.length) {
    return {
      error: { message: '请求体无效' } as const,
    }
  }

  return {
    data: {
      duplicateStrategy: duplicateStrategyResult.data,
      files: await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          content: await file.text(),
        })),
      ),
    },
  }
}

async function hasBuiltinPrefix(prefix: string) {
  const collections = await loadIconCollections()

  return collections[prefix] !== undefined
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
      const body = c.req.valid('json')

      if (await hasBuiltinPrefix(body.prefix)) {
        return c.json({ message: '图标集前缀已存在' }, 409)
      }

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
      async (c) => {
        const { prefix } = c.req.valid('param')

        if (!isFormRequest(c.req.header('content-type'))) {
          return c.json({ message: '请求体无效' }, 400)
        }

        let formData: FormData

        try {
          formData = await c.req.formData()
        } catch {
          return c.json({ message: '请求体无效' }, 400)
        }

        const parsed = await parseUploadInput(formData)

        if ('error' in parsed) {
          return c.json(parsed.error, 400)
        }

        return c.json(await service.uploadIcons(prefix, parsed.data))
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
