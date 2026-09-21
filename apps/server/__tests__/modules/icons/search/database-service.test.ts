import { describe, expect } from 'vitest'
import { createIconSearchService } from '../../../../src/modules/icons/search/service'
import { replaceIconSearchDocuments } from '../../../../src/modules/icons/search/rebuild'
import { IconSearchPreparingError } from '../../../../src/modules/icons/search/errors'
import { dbTest } from '../../../fixtures/database'

describe('unified icon search service', () => {
  dbTest('serves empty-query recommendations without a committed index', async ({ db }) => {
    const result = await createIconSearchService(db).searchIcons({ keyword: '   ', limit: 1 })
    expect(result.list).toHaveLength(1)
  })

  dbTest(
    'requires a committed index for every non-empty query including a complete id',
    async ({ db }) => {
      const service = createIconSearchService(db)
      await expect(
        service.searchIcons({ keyword: 'lucide:camera', limit: 10 }),
      ).rejects.toBeInstanceOf(IconSearchPreparingError)
    },
  )

  dbTest(
    'maps database-ranked builtin and custom results through the selector response',
    async ({ db }) => {
      await replaceIconSearchDocuments(
        db,
        [
          {
            id: 'lucide:camera',
            prefix: 'lucide',
            name: 'camera',
            source: 'builtin',
            collection: 'Lucide',
            palette: false,
            customIconId: null,
            exactPhrases: ['camera'],
            fullTokens: ['camera'],
            primaryEnglishTerms: ['camera'],
            auxiliaryEnglishTerms: [],
          },
        ],
        {
          indexVersion: 'v1',
          iconPackageVersion: 'i1',
          searchDataVersion: 'd1',
          rulesVersion: '1',
        },
      )
      await expect(
        createIconSearchService(db).searchIcons({ keyword: 'cam', limit: 10 }),
      ).resolves.toEqual({
        list: [
          {
            icon: 'lucide:camera',
            prefix: 'lucide',
            name: 'camera',
            collection: 'Lucide',
            palette: false,
          },
        ],
      })
    },
  )
})
