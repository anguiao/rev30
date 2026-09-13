import { describe, expect, vi } from 'vitest'
import { customIconSetIcons, customIconSets, iconSearchDocuments } from '../../../../src/db/schema'
import {
  assertIconSearchAvailable,
  prepareIconSearchIndex,
  startDefaultIconSearchIndexPreparation,
} from '../../../../src/modules/icons/search/lifecycle'
import { IconSearchUnavailableError } from '../../../../src/modules/icons/search/errors'
import { replaceIconSearchDocuments } from '../../../../src/modules/icons/search/repository'
import { dbTest } from '../../../fixtures/database'

const document = {
  id: 'lucide:camera',
  prefix: 'lucide',
  name: 'camera',
  source: 'builtin' as const,
  collection: 'Lucide',
  palette: false,
  customIconId: null,
  exactPhrases: ['camera'],
  fullTokens: ['camera'],
  primaryEnglishTerms: ['camera'],
  auxiliaryEnglishTerms: [],
}
const state = {
  indexVersion: 'same',
  iconPackageVersion: 'icons-v1',
  searchDataVersion: 'data-v1',
  rulesVersion: '1',
}

describe('icon search lifecycle', () => {
  dbTest('records a missing manifest as an asynchronous unavailable state', async ({ db }) => {
    const logger = { error: vi.fn() }
    const runtime = startDefaultIconSearchIndexPreparation(db, {
      logger,
      loadManifest: async () => {
        throw new Error('missing manifest')
      },
      installedIconPackageVersion: 'icons-v1',
    })
    await runtime.completed
    expect(() => assertIconSearchAvailable(db)).toThrow(IconSearchUnavailableError)
    expect(logger.error).toHaveBeenCalledOnce()
  })

  dbTest('rejects artifacts built for a different installed icon package', async ({ db }) => {
    const logger = { error: vi.fn() }
    const runtime = startDefaultIconSearchIndexPreparation(db, {
      logger,
      installedIconPackageVersion: 'icons-v2',
      loadManifest: async () => ({
        formatVersion: 1,
        iconPackageVersion: 'icons-v1',
        searchDataVersion: 'data-v1',
        rulesVersion: '1',
        indexVersion: 'same',
        counts: {
          definitions: 1,
          aliases: 0,
          documents: 1,
          validEnglishRecords: 0,
          validTranslations: 0,
          chineseDocuments: 0,
        },
        files: [],
      }),
    })
    await runtime.completed
    expect(() => assertIconSearchAvailable(db)).toThrow(IconSearchUnavailableError)
    expect(logger.error).toHaveBeenCalledWith(
      { errorMessage: 'Icon search artifacts do not match the installed icon package' },
      'icon search index preparation failed',
    )
  })

  dbTest('backfills current custom business rows on the first committed index', async ({ db }) => {
    const [set] = await db
      .insert(customIconSets)
      .values({ prefix: 'acme', name: 'Acme', description: null })
      .returning()
    await db.insert(customIconSetIcons).values({
      setId: set!.id,
      name: 'logo',
      body: '<path/>',
      width: 24,
      height: 24,
      palette: false,
    })
    await prepareIconSearchIndex(db, { manifest: state, readDocuments: async () => [document] })
    expect((await db.select().from(iconSearchDocuments)).map((row) => row.id).sort()).toEqual([
      'acme:logo',
      'lucide:camera',
    ])
  })

  dbTest('reuses the same committed version without reading document artifacts', async ({ db }) => {
    await replaceIconSearchDocuments(db, [document], state)
    const readDocuments = vi.fn()
    await expect(
      prepareIconSearchIndex(db, { manifest: { ...state, indexVersion: 'same' }, readDocuments }),
    ).resolves.toBe('reused')
    expect(readDocuments).not.toHaveBeenCalled()
  })

  dbTest('updates builtins for data-only changes and rolls back failed imports', async ({ db }) => {
    await replaceIconSearchDocuments(
      db,
      [
        document,
        {
          ...document,
          id: 'acme:logo',
          prefix: 'acme',
          name: 'logo',
          source: 'custom',
          customIconId: '019938cd-c937-7000-8000-000000000001',
        },
      ],
      state,
    )
    await prepareIconSearchIndex(db, {
      manifest: { ...state, indexVersion: 'data-v2-index', searchDataVersion: 'data-v2' },
      readDocuments: async () => [
        { ...document, id: 'tabler:camera', prefix: 'tabler', collection: 'Tabler' },
      ],
    })
    expect((await db.select().from(iconSearchDocuments)).map((row) => row.id).sort()).toEqual([
      'acme:logo',
      'tabler:camera',
    ])

    await expect(
      prepareIconSearchIndex(db, {
        manifest: { ...state, indexVersion: 'broken', searchDataVersion: 'data-v3' },
        readDocuments: async () => {
          throw new Error('broken artifact')
        },
      }),
    ).rejects.toThrow('broken artifact')
    expect((await db.select().from(iconSearchDocuments)).map((row) => row.id).sort()).toEqual([
      'acme:logo',
      'tabler:camera',
    ])
  })

  dbTest('re-derives custom documents when search rules change', async ({ db }) => {
    const [set] = await db
      .insert(customIconSets)
      .values({ prefix: 'acme', name: 'Current Set', description: null })
      .returning()
    const [icon] = await db
      .insert(customIconSetIcons)
      .values({
        setId: set!.id,
        name: 'current-name',
        body: '<path/>',
        width: 24,
        height: 24,
        palette: false,
      })
      .returning()
    await replaceIconSearchDocuments(
      db,
      [
        document,
        {
          ...document,
          id: 'acme:stale',
          prefix: 'acme',
          name: 'stale',
          source: 'custom',
          customIconId: icon!.id,
        },
      ],
      { ...state, rulesVersion: 'old' },
    )
    await prepareIconSearchIndex(db, {
      manifest: { ...state, indexVersion: 'rules-v2' },
      readDocuments: async () => [document],
    })
    expect((await db.select().from(iconSearchDocuments)).map((row) => row.id).sort()).toEqual([
      'acme:current-name',
      'lucide:camera',
    ])
  })
})
