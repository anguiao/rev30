import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../../../helpers/db'
import {
  CustomIconConflictError,
  CustomIconNotFoundError,
  CustomIconSetConflictError,
  CustomIconSetNotFoundError,
} from '../../../../../src/modules/content/icon-sets/custom/errors'
import { createCustomIconSetRepository } from '../../../../../src/modules/content/icon-sets/custom/repository'
import { createCustomIconSetService } from '../../../../../src/modules/content/icon-sets/custom/service'
import { parseSvgIcon } from '../../../../../src/modules/content/icon-sets/custom/svg'

function svg(size: number, body: string) {
  return `<svg viewBox="0 0 ${size} ${size}">${body}</svg>`
}

function rect(fill: string) {
  return `<path fill="${fill}" d="M0 0h10v10H0z" />`
}

describe('custom icon set service', () => {
  it('creates, lists, updates, and deletes custom icon sets', async () => {
    const database = await createTestDb()
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
  })

  it('uploads duplicate icons with skip and replace strategies', async () => {
    const database = await createTestDb()
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
        },
        {
          filename: 'logo.svg',
          content: svg(32, rect('#ff0000')),
        },
      ],
    })

    expect(skippedDuplicate.created).toHaveLength(1)
    expect(skippedDuplicate.created[0]).toMatchObject({
      icon: 'acme:logo',
      name: 'logo',
      width: 24,
      height: 24,
    })
    expect(skippedDuplicate.skipped).toEqual([
      {
        name: 'logo',
        sourceFilename: 'logo.svg',
        reason: 'duplicate',
      },
    ])
    expect(skippedDuplicate.replaced).toEqual([])
    expect(skippedDuplicate.failed).toEqual([])

    const replacedDuplicate = await service.uploadIcons('acme', {
      duplicateStrategy: 'replace',
      files: [
        {
          filename: 'Logo.svg',
          content: svg(32, `${rect('#ff0000')}${rect('#00ff00')}`),
        },
      ],
    })

    expect(replacedDuplicate.created).toEqual([])
    expect(replacedDuplicate.replaced).toHaveLength(1)
    expect(replacedDuplicate.replaced[0]).toMatchObject({
      icon: 'acme:logo',
      width: 32,
      height: 32,
    })
  })

  it('lists, renames, exports, and deletes icons', async () => {
    const database = await createTestDb()
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
          content: svg(24, rect('#000')),
        },
      ],
    })

    await expect(
      service.listIcons({ keyword: undefined, prefix: 'acme', page: 1, pageSize: 80 }),
    ).resolves.toMatchObject({
      total: 1,
      list: [
        {
          icon: 'acme:logo',
          prefix: 'acme',
          name: 'logo',
          setName: 'Acme Icons',
        },
      ],
    })

    const renamed = await service.renameIcon('acme', 'logo', { name: 'brand' })

    expect(renamed).toMatchObject({
      icon: 'acme:brand',
      name: 'brand',
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
          width: 24,
          height: 24,
        },
      },
    })
    expect(exported.icons.brand?.body).toContain('currentColor')

    await service.deleteIcon('acme', 'brand')
    await expect(
      service.listIcons({ keyword: undefined, prefix: 'acme', page: 1, pageSize: 80 }),
    ).resolves.toMatchObject({
      total: 0,
      list: [],
    })
  })

  it('reports failed files without aborting the upload', async () => {
    const database = await createTestDb()
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
          filename: 'Bad.svg',
          content: '<svg><script>alert(1)</script>',
        },
      ],
    })

    expect(result.created.map((icon) => icon.name)).toEqual(['good'])
    expect(result.failed).toEqual([
      {
        sourceFilename: 'Bad.svg',
        message: 'SVG 无效',
      },
    ])
  })

  it('throws domain errors for conflicts and missing records', async () => {
    const database = await createTestDb()
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
        },
        {
          filename: 'Brand.svg',
          content: svg(24, rect('#000')),
        },
      ],
    })

    await expect(service.renameIcon('acme', 'logo', { name: 'brand' })).rejects.toBeInstanceOf(
      CustomIconConflictError,
    )
    await expect(service.get('missing')).rejects.toBeInstanceOf(CustomIconSetNotFoundError)
    await expect(
      service.uploadIcons('missing', { duplicateStrategy: 'skip', files: [] }),
    ).rejects.toBeInstanceOf(CustomIconSetNotFoundError)
    await expect(
      service.renameIcon('acme', 'missing', { name: 'new-name' }),
    ).rejects.toBeInstanceOf(CustomIconNotFoundError)
    await expect(service.deleteIcon('acme', 'missing')).rejects.toBeInstanceOf(
      CustomIconNotFoundError,
    )
    await expect(service.exportIconSet('missing')).rejects.toBeInstanceOf(
      CustomIconSetNotFoundError,
    )
  })

  it('translates custom icon set unique constraints into domain conflicts', async () => {
    const database = await createTestDb()
    const repository = createCustomIconSetRepository(database)

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
  })

  it('translates custom icon unique constraints into domain conflicts', async () => {
    const database = await createTestDb()
    const repository = createCustomIconSetRepository(database)
    const set = await repository.createSet({
      prefix: 'acme',
      name: 'Acme Icons',
      description: null,
    })
    const parsedIcon = await parseSvgIcon('Logo.svg', svg(24, rect('#000')))

    await repository.createIcon(set, parsedIcon)
    await expect(repository.createIcon(set, parsedIcon)).rejects.toBeInstanceOf(
      CustomIconConflictError,
    )
  })
})
