import { customIconKeywordsSchema, iconSearchQuerySchema } from '@rev30/contracts'
import { eq } from 'drizzle-orm'
import type { Db } from '../../../src/db'
import { iconSearchDocuments } from '../../../src/db/schema'
import { deriveCustomIconSearchDocument } from '../../../src/modules/icons/search/document'
import { insertDocumentBatch } from '../../../src/modules/icons/search/indexing/sync'
import { searchIconDocuments } from '../../../src/modules/icons/search/repository'
import { percentile95 } from '../benchmark/measure'

export async function measureExpressionStress(database: Db, samples: number) {
  const words = Array.from(
    { length: 40 },
    (_, index) => `${String.fromCodePoint(0x4e00 + index)}词`,
  )
  const independent = Array.from({ length: 20 }, (_, index) =>
    words.slice(index * 2, index * 2 + 2).join(' '),
  )
  const repeated = Array.from({ length: 20 }, (_, index) =>
    Array(index + 1)
      .fill('甲')
      .join(' '),
  )
  const cases = [
    {
      name: 'independent',
      keywords: independent,
      query: independent.join(' '),
      primaryMatches: 40,
    },
    {
      name: 'repeated',
      keywords: repeated,
      query: Array(60).fill('甲').join(' '),
      primaryMatches: 10,
    },
    {
      name: 'repeated-english',
      keywords: [...repeated.slice(0, 19), 'find'],
      query: `${Array(58).fill('甲').join(' ')} find`,
      primaryMatches: 10,
    },
  ]
  const prefix = 'quality-stress'
  await insertDocumentBatch(
    database,
    cases.map((entry, index) =>
      deriveCustomIconSearchDocument({
        prefix,
        name: entry.name,
        collection: 'Quality Stress',
        palette: false,
        customIconId: `00000000-0000-0000-0000-00000000000${index + 1}`,
        keywords: customIconKeywordsSchema.parse(entry.keywords),
      }),
    ),
  )
  const results = []
  try {
    for (const entry of cases) {
      const { keyword } = iconSearchQuerySchema.parse({ keyword: entry.query })
      const run = async () => {
        const start = performance.now()
        const result = await searchIconDocuments(database, { keyword, limit: 60 })
        const elapsed = performance.now() - start
        const target = result.rows.find((row) => row.id === `${prefix}:${entry.name}`)
        if (!target || target.primaryMatches !== entry.primaryMatches)
          throw new Error(`Incorrect stress result: ${entry.name}`)
        return elapsed
      }
      await run()
      await run()
      const timings = []
      for (let index = 0; index < samples; index++) timings.push(await run())
      const burstTimings = []
      for (let batch = 0; batch < Math.ceil(samples / 10); batch++)
        burstTimings.push(...(await Promise.all(Array.from({ length: 10 }, run))))
      const result = {
        ...entry,
        queryLength: keyword.length,
        samples: timings,
        p95Ms: percentile95(timings),
        burstSamples: burstTimings,
        burstP95Ms: percentile95(burstTimings),
      }
      results.push(result)
      console.log(
        JSON.stringify({
          scope: 'full-stress',
          name: entry.name,
          p95Ms: result.p95Ms,
          burstP95Ms: result.burstP95Ms,
        }),
      )
    }
  } finally {
    await database.delete(iconSearchDocuments).where(eq(iconSearchDocuments.prefix, prefix))
  }
  return results
}
