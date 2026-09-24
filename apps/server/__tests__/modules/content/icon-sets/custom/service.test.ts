import { afterEach, describe, expect, vi } from 'vitest'
import { dbTest } from '../../../../fixtures/database'
import {
  CustomIconConflictError,
  CustomIconNotFoundError,
  CustomIconSetConflictError,
  CustomIconSetNotFoundError,
} from '../../../../../src/modules/content/icon-sets/custom/errors'
import * as customIconRepository from '../../../../../src/modules/content/icon-sets/custom/repository'
import { createCustomIconSetService } from '../../../../../src/modules/content/icon-sets/custom/service'
import { parseSvgIcon } from '../../../../../src/modules/content/icon-sets/custom/svg'

function svg(size: number, body: string) {
  return `<svg viewBox="0 0 ${size} ${size}">${body}</svg>`
}

function rect(fill: string) {
  return `<path fill="${fill}" d="M0 0h10v10H0z" />`
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('custom icon set service', () => {
  dbTest(
    'manages custom icon set lifecycle and reuses deleted prefixes',
    async ({ db: database }) => {
      const service = createCustomIconSetService(database)

      const created = await service.create({
        prefix: 'acme',
        name: 'Acme Icons',
        description: 'Initial description',
      })

      expect(created).toMatchObject({
        prefix: 'acme',
        name: 'Acme Icons',
        description: 'Initial description',
        iconCount: 0,
      })

      const list = await service.list({ keyword: undefined })

      expect(list.total).toBe(1)
      expect(list.list[0]).toMatchObject({
        prefix: 'acme',
        iconCount: 0,
      })

      const updated = await service.update('acme', {
        name: 'Acme Product Icons',
        description: null,
      })

      expect(updated).toMatchObject({
        prefix: 'acme',
        name: 'Acme Product Icons',
        description: null,
      })
      await expect(service.get('acme')).resolves.toMatchObject({ name: 'Acme Product Icons' })

      await service.delete('acme')
      await expect(service.get('acme')).rejects.toBeInstanceOf(CustomIconSetNotFoundError)
      await expect(service.list({ keyword: undefined })).resolves.toMatchObject({
        total: 0,
        list: [],
      })
      await expect(
        service.create({
          prefix: 'acme',
          name: 'Recreated Acme Icons',
          description: null,
        }),
      ).resolves.toMatchObject({
        prefix: 'acme',
        name: 'Recreated Acme Icons',
      })
    },
  )

  dbTest('uploads duplicate icons with skip and replace strategies', async ({ db: database }) => {
    const service = createCustomIconSetService(database)

    await service.create({
      prefix: 'acme',
      name: 'Acme Icons',
      description: null,
    })

    const skippedDuplicate = await service.uploadIcons('acme', {
      duplicateStrategy: 'skip',
      files: [
        {
          filename: 'Logo.svg',
          content: svg(24, rect('#000')),
          keywords: ['First'],
        },
        {
          filename: 'Logo.svg',
          content: svg(32, rect('#ff0000')),
          keywords: ['Skipped'],
        },
      ],
    })

    expect(skippedDuplicate.results).toEqual([
      {
        status: 'created',
        icon: expect.objectContaining({
          icon: 'acme:logo',
          name: 'logo',
          width: 24,
          height: 24,
          keywords: ['First'],
        }),
      },
      {
        status: 'skipped',
        name: 'logo',
        reason: 'duplicate',
      },
    ])

    const replacedDuplicate = await service.uploadIcons('acme', {
      duplicateStrategy: 'replace',
      files: [
        {
          filename: 'Logo.svg',
          content: svg(32, `${rect('#ff0000')}${rect('#00ff00')}`),
        },
      ],
    })

    expect(replacedDuplicate.results).toEqual([
      {
        status: 'replaced',
        icon: expect.objectContaining({
          icon: 'acme:logo',
          width: 32,
          height: 32,
          keywords: ['First'],
        }),
      },
    ])

    const cleared = await service.uploadIcons('acme', {
      duplicateStrategy: 'replace',
      files: [{ filename: 'Logo.svg', content: svg(24, rect('#000')), keywords: [] }],
    })
    expect(cleared.results).toMatchObject([{ status: 'replaced', icon: { keywords: [] } }])
  })

  dbTest(
    'applies duplicate strategies when creation conflicts after a missing lookup',
    async ({ db }) => {
      const repository = customIconRepository.createCustomIconSetRepository(db)
      const set = await repository.createSet({ prefix: 'acme', name: 'Acme', description: null })
      await repository.createIcon(set.set, await parseSvgIcon('Logo.svg', svg(24, rect('#000'))), [
        'First',
      ])

      for (const duplicateStrategy of ['skip', 'replace'] as const) {
        vi.spyOn(repository, 'findIcon').mockResolvedValueOnce(undefined)
        vi.spyOn(customIconRepository, 'createCustomIconSetRepository').mockReturnValueOnce(
          repository,
        )
        const service = createCustomIconSetService(db)
        const result = await service.uploadIcons('acme', {
          duplicateStrategy,
          files: [{ filename: 'Logo.svg', content: svg(32, rect('#000')), keywords: ['Changed'] }],
        })

        expect(result.results).toMatchObject([
          { status: duplicateStrategy === 'skip' ? 'skipped' : 'replaced' },
        ])
        expect(await repository.findIcon(set.set.id, 'logo')).toMatchObject({
          width: duplicateStrategy === 'skip' ? 24 : 32,
          keywords: duplicateStrategy === 'skip' ? ['First'] : ['Changed'],
        })
      }
    },
  )

  dbTest(
    'lists, renames, exports, and deletes icons with decimal dimensions',
    async ({ db: database }) => {
      const service = createCustomIconSetService(database)

      await service.create({
        prefix: 'acme',
        name: 'Acme Icons',
        description: null,
      })
      await service.uploadIcons('acme', {
        duplicateStrategy: 'skip',
        files: [
          {
            filename: 'Logo.svg',
            content: `<svg viewBox="0 0 25.9 16.8">${rect('#000')}</svg>`,
            keywords: ['Original'],
          },
        ],
      })

      await expect(
        service.listIcons({ keyword: undefined, prefix: 'acme', cursor: undefined, pageSize: 80 }),
      ).resolves.toMatchObject({
        nextCursor: null,
        list: [
          {
            icon: 'acme:logo',
            prefix: 'acme',
            name: 'logo',
            setName: 'Acme Icons',
            width: 25.9,
            height: 16.8,
          },
        ],
      })

      const renamed = await service.updateIcon('acme', 'logo', { name: 'brand' })

      expect(renamed).toMatchObject({
        icon: 'acme:brand',
        name: 'brand',
        keywords: ['Original'],
        width: 25.9,
        height: 16.8,
      })

      const exported = await service.exportIconSet('acme')

      expect(exported).toMatchObject({
        prefix: 'acme',
        aliases: {},
        info: {
          name: 'Acme Icons',
          total: 1,
          author: {
            name: 'Rev30',
          },
          license: {
            title: 'Custom',
          },
          samples: ['brand'],
          palette: false,
        },
        lastModified: expect.any(Number),
        icons: {
          brand: {
            width: 25.9,
            height: 16.8,
          },
        },
      })
      expect(JSON.stringify(exported)).not.toContain('keywords')
      expect(exported.icons.brand?.body).toContain('currentColor')

      await service.deleteIcon('acme', 'brand')
      await expect(
        service.listIcons({ keyword: undefined, prefix: 'acme', cursor: undefined, pageSize: 80 }),
      ).resolves.toMatchObject({
        nextCursor: null,
        list: [],
      })
    },
  )

  dbTest('reports failed files without aborting the upload', async ({ db: database }) => {
    const service = createCustomIconSetService(database)

    await service.create({
      prefix: 'acme',
      name: 'Acme Icons',
      description: null,
    })

    const result = await service.uploadIcons('acme', {
      duplicateStrategy: 'skip',
      files: [
        {
          filename: 'Good.svg',
          content: svg(24, rect('#000')),
        },
        {
          filename: 'Good.svg',
          content: '<svg><script>alert(1)</script>',
        },
        {
          filename: 'Zero.svg',
          content: `<svg viewBox="0 0 0 24">${rect('#000')}</svg>`,
        },
        {
          filename: 'After.svg',
          content: svg(24, rect('#000')),
        },
      ],
    })

    expect(result.results).toEqual([
      { status: 'created', icon: expect.objectContaining({ name: 'good' }) },
      {
        status: 'failed',
        message: 'SVG 无效',
      },
      {
        status: 'failed',
        message: 'SVG 无效',
      },
      { status: 'created', icon: expect.objectContaining({ name: 'after' }) },
    ])
  })

  dbTest('throws domain errors for conflicts and missing records', async ({ db: database }) => {
    const service = createCustomIconSetService(database)

    await service.create({
      prefix: 'acme',
      name: 'Acme Icons',
      description: null,
    })

    await expect(
      service.create({
        prefix: 'acme',
        name: 'Duplicate Prefix',
        description: null,
      }),
    ).rejects.toBeInstanceOf(CustomIconSetConflictError)
    await expect(
      service.create({
        prefix: 'lucide',
        name: 'Builtin Prefix',
        description: null,
      }),
    ).rejects.toBeInstanceOf(CustomIconSetConflictError)

    await service.uploadIcons('acme', {
      duplicateStrategy: 'skip',
      files: [
        {
          filename: 'Logo.svg',
          content: svg(24, rect('#000')),
          keywords: ['Original'],
        },
        {
          filename: 'Brand.svg',
          content: svg(24, rect('#000')),
        },
      ],
    })

    await expect(
      service.updateIcon('acme', 'logo', { name: 'brand', keywords: ['Changed'] }),
    ).rejects.toBeInstanceOf(CustomIconConflictError)
    await expect(
      service.listIcons({ keyword: undefined, prefix: 'acme', cursor: undefined, pageSize: 80 }),
    ).resolves.toMatchObject({
      list: expect.arrayContaining([
        expect.objectContaining({ icon: 'acme:logo', keywords: ['Original'] }),
      ]),
    })
    await expect(service.get('missing')).rejects.toBeInstanceOf(CustomIconSetNotFoundError)
    await expect(
      service.uploadIcons('missing', { duplicateStrategy: 'skip', files: [] }),
    ).rejects.toBeInstanceOf(CustomIconSetNotFoundError)
    await expect(
      service.updateIcon('acme', 'missing', { name: 'new-name' }),
    ).rejects.toBeInstanceOf(CustomIconNotFoundError)
    await expect(service.deleteIcon('acme', 'missing')).rejects.toBeInstanceOf(
      CustomIconNotFoundError,
    )
    await expect(service.exportIconSet('missing')).rejects.toBeInstanceOf(
      CustomIconSetNotFoundError,
    )
  })

  dbTest(
    'translates custom icon set unique constraints into domain conflicts',
    async ({ db: database }) => {
      const repository = customIconRepository.createCustomIconSetRepository(database)

      await repository.createSet({
        prefix: 'acme',
        name: 'Acme Icons',
        description: null,
      })

      await expect(
        repository.createSet({
          prefix: 'acme',
          name: 'Duplicate Prefix',
          description: null,
        }),
      ).rejects.toBeInstanceOf(CustomIconSetConflictError)
    },
  )

  dbTest(
    'translates custom icon unique constraints into domain conflicts',
    async ({ db: database }) => {
      const repository = customIconRepository.createCustomIconSetRepository(database)
      const set = await repository.createSet({
        prefix: 'acme',
        name: 'Acme Icons',
        description: null,
      })
      const parsedIcon = await parseSvgIcon('Logo.svg', svg(24, rect('#000')))

      await repository.createIcon(set.set, parsedIcon)
      await expect(repository.createIcon(set.set, parsedIcon)).rejects.toBeInstanceOf(
        CustomIconConflictError,
      )
    },
  )
})
