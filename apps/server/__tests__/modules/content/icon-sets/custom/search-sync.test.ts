import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, onTestFinished } from 'vitest'
import {
  customIconSetIcons,
  customIconSets,
  iconSearchDocuments,
} from '../../../../../src/db/schema'
import { createCustomIconSetService } from '../../../../../src/modules/content/icon-sets/custom/service'
import { createCustomIconSetRepository } from '../../../../../src/modules/content/icon-sets/custom/repository'
import { CustomIconSetNotFoundError } from '../../../../../src/modules/content/icon-sets/custom/errors'
import { parseSvgIcon } from '../../../../../src/modules/content/icon-sets/custom/svg'
import { builtinSearchFacts, replaceIconSearchDocuments } from '../../../../fixtures/icon-search'
import { prepareIconSearchIndex } from '../../../../../src/modules/icons/search/indexing/lifecycle'
import { setIconSearchStatus } from '../../../../../src/modules/icons/search/indexing/state'
import { initializeRuntimeIconSearchConcepts } from '../../../../../src/modules/icons/search/runtime-concepts'
import { IconSearchUnavailableError } from '../../../../../src/modules/icons/errors'
import { dbTest } from '../../../../fixtures/database'

const svg = '<svg viewBox="0 0 24 24"><path d="M0 0h10v10H0z" /></svg>'

describe('custom icon search synchronization', () => {
  beforeAll(() => initializeRuntimeIconSearchConcepts())

  dbTest('gates non-empty search while normalized blank input still browses', async ({ db }) => {
    onTestFinished(() => setIconSearchStatus('ready'))
    const service = createCustomIconSetService(db)
    const [set] = await db
      .insert(customIconSets)
      .values({ prefix: 'acme', name: 'Acme', description: null })
      .returning()
    await db.insert(customIconSetIcons).values({
      setId: set!.id,
      name: 'logo',
      body: '<path/>',
      width: 16,
      height: 16,
      palette: false,
    })
    await expect(
      prepareIconSearchIndex(db, {
        installedIconPackageVersion: 'missing',
        loadArtifacts: async () => {
          throw new Error('missing manifest')
        },
      }),
    ).rejects.toThrow('missing manifest')

    await expect(
      service.listIcons({ keyword: 'logo', prefix: undefined, cursor: undefined, pageSize: 10 }),
    ).rejects.toBeInstanceOf(IconSearchUnavailableError)
    await expect(
      service.listIcons({ keyword: '\u3000', prefix: undefined, cursor: undefined, pageSize: 10 }),
    ).resolves.toMatchObject({ list: [expect.objectContaining({ icon: 'acme:logo' })] })
  })

  dbTest(
    'updates descriptions and unchanged names without rewriting search documents',
    async ({ db }) => {
      const repository = createCustomIconSetRepository(db)
      const set = await repository.createSet({ prefix: 'acme', name: 'Acme', description: null })
      await repository.createIcon(set.set, await parseSvgIcon('Logo.svg', svg))
      await db.execute(`
      CREATE FUNCTION reject_icon_rewrite() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'unexpected search rewrite'; END;
      $$ LANGUAGE plpgsql
    `)
      await db.execute(`
      CREATE TRIGGER reject_icon_rewrite BEFORE DELETE OR INSERT ON icon_search_documents
      FOR EACH STATEMENT EXECUTE FUNCTION reject_icon_rewrite()
    `)
      await expect(repository.updateSet('acme', { description: 'First' })).resolves.toMatchObject({
        set: { name: 'Acme', description: 'First' },
        iconCount: 1,
      })
      await expect(
        repository.updateSet('acme', { name: 'Acme', description: 'Second' }),
      ).resolves.toMatchObject({
        set: { name: 'Acme', description: 'Second' },
        iconCount: 1,
      })
      expect(await db.select().from(iconSearchDocuments)).toEqual([
        expect.objectContaining({ id: 'acme:logo', collection: 'Acme' }),
      ])
    },
  )

  dbTest(
    'preserves search documents for visual-only replacements and synchronizes palette changes',
    async ({ db }) => {
      const repository = createCustomIconSetRepository(db)
      const set = await repository.createSet({ prefix: 'acme', name: 'Acme', description: null })
      const parsed = await parseSvgIcon('Logo.svg', svg)
      const icon = await repository.createIcon(set.set, parsed, ['Logo'])
      const [before] = await db.select().from(iconSearchDocuments)
      await repository.replaceIcon(icon.id, { ...parsed, body: '<path d="M1 1h8v8H1z"/>' })
      expect(await db.select().from(iconSearchDocuments)).toEqual([before])
      await repository.replaceIcon(icon.id, { ...parsed, palette: !parsed.palette }, ['Brand'])
      expect(await db.select().from(iconSearchDocuments)).toEqual([
        expect.objectContaining({
          palette: !parsed.palette,
          exactKeys: ['logo', 'brand'],
          preference: parsed.palette ? 1 : 0,
        }),
      ])
    },
  )

  dbTest(
    'uses current set data and rejects deleted sets when given a stale set object',
    async ({ db }) => {
      const repository = createCustomIconSetRepository(db)
      const stale = await repository.createSet({
        prefix: 'acme',
        name: 'Old Name',
        description: null,
      })
      await db
        .update(customIconSets)
        .set({ name: 'Current Name' })
        .where(eq(customIconSets.id, stale.set.id))

      const parsed = await parseSvgIcon('Logo.svg', svg)
      await repository.createIcon(stale.set, parsed)
      expect(await db.select().from(iconSearchDocuments)).toEqual([
        expect.objectContaining({ id: 'acme:logo', collection: 'Current Name' }),
      ])

      const deleted = await repository.createSet({
        prefix: 'gone',
        name: 'Gone',
        description: null,
      })
      await repository.softDeleteSet('gone')
      await expect(repository.createIcon(deleted.set, parsed)).rejects.toBeInstanceOf(
        CustomIconSetNotFoundError,
      )
      expect(
        await db
          .select()
          .from(customIconSetIcons)
          .where(eq(customIconSetIcons.setId, deleted.set.id)),
      ).toEqual([])
    },
  )

  dbTest(
    'rolls back the business write when derived document synchronization fails',
    async ({ db }) => {
      const repository = createCustomIconSetRepository(db)
      const set = await repository.createSet({ prefix: 'acme', name: 'Acme', description: null })
      await replaceIconSearchDocuments(db, [
        builtinSearchFacts('acme', 'logo', { collection: 'Conflict' }),
      ])
      const parsed = await parseSvgIcon('Logo.svg', svg)
      await expect(repository.createIcon(set.set, parsed)).rejects.toThrow()
      expect(await db.select().from(customIconSetIcons)).toEqual([])
    },
  )

  dbTest('browses custom icons in complete-id byte order', async ({ db }) => {
    const service = createCustomIconSetService(db)
    for (const prefix of ['fa', 'fa-brands']) {
      const [set] = await db
        .insert(customIconSets)
        .values({ prefix, name: prefix, description: null })
        .returning()
      await db.insert(customIconSetIcons).values({
        setId: set!.id,
        name: 'a',
        body: '<path/>',
        width: 16,
        height: 16,
        palette: false,
      })
    }
    const result = await service.listIcons({
      keyword: undefined,
      prefix: undefined,
      cursor: undefined,
      pageSize: 10,
    })
    expect(result.list.map((item) => item.icon)).toEqual(['fa-brands:a', 'fa:a'])
  })

  dbTest(
    'creates, renames and deletes derived documents with their business records',
    async ({ db }) => {
      const service = createCustomIconSetService(db)
      await service.create({ prefix: 'acme', name: 'Acme Icons', description: null })
      await service.uploadIcons('acme', {
        duplicateStrategy: 'skip',
        files: [{ filename: 'Logo.svg', content: svg }],
      })
      const [created] = await db
        .select()
        .from(iconSearchDocuments)
        .where(eq(iconSearchDocuments.id, 'acme:logo'))
      expect(created).toMatchObject({
        source: 'custom',
        collection: 'Acme Icons',
        exactKeys: ['logo'],
      })

      await service.updateIcon('acme', 'logo', { name: 'brand-logo' })
      const documents = await db.select().from(iconSearchDocuments)
      expect(documents).toEqual([
        expect.objectContaining({ id: 'acme:brand-logo', customIconId: created!.customIconId }),
      ])

      await service.deleteIcon('acme', 'brand-logo')
      expect(await db.select().from(iconSearchDocuments)).toEqual([])
    },
  )

  dbTest(
    'updates collection search fields and removes documents with their set',
    async ({ db }) => {
      const service = createCustomIconSetService(db)
      await service.create({ prefix: 'acme', name: 'Old Name', description: null })
      await service.uploadIcons('acme', {
        duplicateStrategy: 'skip',
        files: ['Logo.svg', 'Mark.svg', 'Brand.svg'].map((filename) => ({
          filename,
          content: svg,
        })),
      })
      await service.update('acme', { name: 'New Name' })
      expect(await db.select().from(iconSearchDocuments)).toEqual([
        expect.objectContaining({ collection: 'New Name' }),
        expect.objectContaining({ collection: 'New Name' }),
        expect.objectContaining({ collection: 'New Name' }),
      ])
      await service.delete('acme')
      expect(await db.select().from(iconSearchDocuments)).toEqual([])
    },
  )
})
