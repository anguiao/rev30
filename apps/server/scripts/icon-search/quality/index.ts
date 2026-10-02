import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { cpus, totalmem } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { PGlite } from '@electric-sql/pglite'
import { lookupCollection } from '@iconify/json'
import { iconSearchQuerySchema } from '@rev30/contracts'
import { drizzle } from 'drizzle-orm/pglite'
import { migratePGlite } from '../../../src/db/migrate'
import { relations } from '../../../src/db/relations'
import {
  defaultIconSearchArtifactDirectory,
  iterateIconSearchArtifacts,
  readIconSearchManifest,
} from '../../../src/modules/icons/search/artifacts/reader'
import type { IconSearchArtifactDocument } from '../../../src/modules/icons/search/artifacts/schema'
import { prepareIconSearchIndex } from '../../../src/modules/icons/search/indexing/lifecycle'
import { searchIconDocuments } from '../../../src/modules/icons/search/repository'
import { createIconSearchService } from '../../../src/modules/icons/search/service'
import { listBuiltinIcons } from '../../../src/modules/content/icon-sets/builtin/service'
import { directorySize, percentile95 } from '../benchmark/measure'
import { measureExpressionStress } from './stress'
import {
  qualityPerformanceCases,
  qualityQueries,
  qualitySampleIds,
  qualitySampleVersion,
} from './sample'

const outputDirectory = resolve(
  process.argv[2] ?? '/private/tmp/rev30-icon-search-quality/baseline',
)
const artifactDirectory = resolve(process.argv[3] ?? defaultIconSearchArtifactDirectory)
const requestedSamples = Number(process.argv[4] ?? 60)
if (!Number.isSafeInteger(requestedSamples) || requestedSamples < 1) {
  throw new Error('Sample count must be a positive integer')
}
await mkdir(outputDirectory, { recursive: true })

async function save(name: string, value: unknown) {
  await writeFile(join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`)
}

const manifest = await readIconSearchManifest(artifactDirectory)
const sampleIds = new Set<string>(Object.values(qualitySampleIds))
const sampleDocuments: IconSearchArtifactDocument[] = []
for await (const document of iterateIconSearchArtifacts(artifactDirectory, manifest)) {
  if (sampleIds.has(document.id)) sampleDocuments.push(document)
}
if (sampleDocuments.length !== sampleIds.size) throw new Error('The frozen sample is incomplete')
await save('sample-documents.json', sampleDocuments)
await save('manifest.json', manifest)

const sourceMetadata = []
for (const id of sampleIds) {
  const [prefix, name] = id.split(':') as [string, string]
  const collection = await lookupCollection(prefix)
  sourceMetadata.push({
    id,
    definition: Boolean(collection.icons[name]),
    alias: collection.aliases?.[name] ?? null,
    categories: Object.entries(collection.categories ?? {})
      .filter(([, members]) => members.includes(name))
      .map(([category]) => category),
  })
}
await save('sample-metadata.json', sourceMetadata)

const require = createRequire(import.meta.url)
const pglitePackage = JSON.parse(
  await readFile(join(dirname(require.resolve('@electric-sql/pglite')), '../package.json'), 'utf8'),
) as { version: string }
await save('environment.json', {
  sampleVersion: qualitySampleVersion,
  node: process.version,
  pglite: pglitePackage.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: cpus()[0]!.model,
  logicalCpus: cpus().length,
  totalMemoryBytes: totalmem(),
  artifactDirectory,
  artifactBytes: await directorySize(artifactDirectory),
  requestedSamples,
  productionPostgresMeasured: false,
})

for (const scope of ['controlled', 'full'] as const) {
  const dataDirectory = await mkdtemp(join(outputDirectory, `${scope}-pglite-`))
  const client = new PGlite(dataDirectory)
  try {
    await client.waitReady
    await migratePGlite(client)
    const database = drizzle({ client, relations })
    const memoryBeforeImport = process.memoryUsage()
    let peakRss = memoryBeforeImport.rss
    let peakHeapUsed = memoryBeforeImport.heapUsed
    const memoryTimer = setInterval(() => {
      const memory = process.memoryUsage()
      peakRss = Math.max(peakRss, memory.rss)
      peakHeapUsed = Math.max(peakHeapUsed, memory.heapUsed)
    }, 25)
    const importStart = performance.now()
    let importOutcome: Awaited<ReturnType<typeof prepareIconSearchIndex>>
    try {
      importOutcome = await prepareIconSearchIndex(database, {
        installedIconPackageVersion: manifest.iconPackageVersion,
        loadArtifacts: async () => ({
          manifest,
          documents:
            scope === 'controlled'
              ? sampleDocuments
              : iterateIconSearchArtifacts(artifactDirectory, manifest),
        }),
      })
    } finally {
      clearInterval(memoryTimer)
    }
    await save(`${scope}-import.json`, {
      outcome: importOutcome,
      dataDirectory,
      elapsedMs: performance.now() - importStart,
      documents: scope === 'controlled' ? sampleDocuments.length : manifest.counts.documents,
      memoryBeforeImport,
      memoryAfterImport: process.memoryUsage(),
      peakRss,
      peakHeapUsed,
      diskBytes: await directorySize(dataDirectory),
    })
    const selector = createIconSearchService(database)
    const results = []
    for (const query of qualityQueries) {
      const selection = await selector.searchIcons({ keyword: query.query, limit: 20 })
      const selectorTop20 = selection.list.map((item) => item.icon)
      const libraryFirst = await listBuiltinIcons({ keyword: query.query, pageSize: 20 }, database)
      const libraryTop20 = libraryFirst.list.map((item) => item.icon)
      const libraryIds = [...libraryTop20]
      let cursor = libraryFirst.nextCursor
      let pages = 1
      const seenCursors = new Set<string>()
      while (cursor) {
        if (seenCursors.has(cursor)) throw new Error(`Repeated cursor for ${query.query}`)
        seenCursors.add(cursor)
        const page = await listBuiltinIcons(
          { keyword: query.query, pageSize: 60, cursor },
          database,
        )
        libraryIds.push(...page.list.map((item) => item.icon))
        cursor = page.nextCursor
        pages++
      }
      const missing = query.required.filter(
        (label) => !libraryIds.includes(qualitySampleIds[label]),
      )
      const forbidden = query.forbidden.filter((label) =>
        libraryIds.includes(qualitySampleIds[label]),
      )
      const exactMatch =
        !query.exact ||
        JSON.stringify(libraryIds) ===
          JSON.stringify(query.exact.map((label) => qualitySampleIds[label]))
      const ordered =
        !query.before ||
        (libraryIds.includes(qualitySampleIds[query.before[0]]) &&
          libraryIds.indexOf(qualitySampleIds[query.before[0]]) <
            libraryIds.indexOf(qualitySampleIds[query.before[1]]))
      const sameEntries = JSON.stringify(selectorTop20) === JSON.stringify(libraryTop20)
      const duplicateCount = libraryIds.length - new Set(libraryIds).size
      const result = {
        ...query,
        selectorTop20,
        libraryTop20,
        libraryIds,
        pages,
        targetPositions: Object.fromEntries(
          Object.entries(qualitySampleIds).map(([label, id]) => [label, libraryIds.indexOf(id)]),
        ),
        missing,
        forbidden,
        exactMatch,
        ordered,
        sameEntries,
        duplicateCount,
        passed:
          missing.length === 0 &&
          forbidden.length === 0 &&
          exactMatch &&
          ordered &&
          sameEntries &&
          duplicateCount === 0,
      }
      results.push(result)
      console.log(
        JSON.stringify({
          scope,
          number: query.number,
          query: query.query,
          total: libraryIds.length,
          passed: result.passed,
        }),
      )
    }
    await save(`${scope}-queries.json`, results)
    if (scope === 'controlled') continue

    const performanceResults = []
    for (const benchmarkCase of qualityPerformanceCases) {
      const { keyword } = iconSearchQuerySchema.parse({ keyword: benchmarkCase.query, limit: '60' })
      for (let warmup = 0; warmup < 2; warmup++) {
        await searchIconDocuments(database, { keyword, limit: 60 })
      }
      const samples = []
      for (let index = 0; index < requestedSamples; index++) {
        const start = performance.now()
        await searchIconDocuments(database, { keyword, limit: 60 })
        samples.push(performance.now() - start)
      }
      const burstSamples: number[] = []
      for (let batch = 0; batch < Math.ceil(requestedSamples / 10); batch++) {
        await Promise.all(
          Array.from({ length: 10 }, async () => {
            const start = performance.now()
            await searchIconDocuments(database, { keyword, limit: 60 })
            burstSamples.push(performance.now() - start)
          }),
        )
      }
      const result = {
        ...benchmarkCase,
        samples,
        p95Ms: percentile95(samples),
        burstSamples,
        burstP95Ms: percentile95(burstSamples),
      }
      performanceResults.push(result)
      console.log(
        JSON.stringify({
          scope,
          ...benchmarkCase,
          p95Ms: result.p95Ms,
          burstP95Ms: result.burstP95Ms,
        }),
      )
    }
    const firstPage = await searchIconDocuments(database, { keyword: 'icon', limit: 60 })
    if (!firstPage.nextCursor) throw new Error('Pagination measurement needs another page')
    const paginationSamples = []
    for (let index = 0; index < requestedSamples; index++) {
      const start = performance.now()
      await searchIconDocuments(database, {
        keyword: 'icon',
        limit: 60,
        cursor: firstPage.nextCursor,
      })
      paginationSamples.push(performance.now() - start)
    }
    const paginationBurstSamples: number[] = []
    for (let batch = 0; batch < Math.ceil(requestedSamples / 10); batch++) {
      await Promise.all(
        Array.from({ length: 10 }, async () => {
          const start = performance.now()
          await searchIconDocuments(database, {
            keyword: 'icon',
            limit: 60,
            cursor: firstPage.nextCursor!,
          })
          paginationBurstSamples.push(performance.now() - start)
        }),
      )
    }
    await save('full-performance.json', {
      cases: performanceResults,
      pagination: {
        query: 'icon',
        samples: paginationSamples,
        p95Ms: percentile95(paginationSamples),
        burstSamples: paginationBurstSamples,
        burstP95Ms: percentile95(paginationBurstSamples),
      },
    })
    await save('full-final-memory.json', {
      memory: process.memoryUsage(),
      diskBytes: await directorySize(dataDirectory),
    })
    await save(
      'full-stress-performance.json',
      await measureExpressionStress(database, requestedSamples),
    )
  } finally {
    await client.close()
  }
}
