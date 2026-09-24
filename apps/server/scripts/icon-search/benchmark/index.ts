import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { customIconSetIcons, customIconSets } from '../../../src/db/schema'
import { migratePGlite } from '../../../src/db/migrate'
import { relations } from '../../../src/db/relations'
import { createAuthMiddleware } from '../../../src/middleware/auth'
import { createIconRoutes } from '../../../src/modules/icons/routes'
import { browseBuiltinIcons } from '../../../src/modules/content/icon-sets/builtin/service'
import { runImportBenchmark, runReuseBenchmark } from './indexing'
import { directorySize, emit, measure, percentile95 } from './measure'
import { runBurstBenchmark, runPaginationBenchmark, runSearchBenchmark } from './search'

const requestedSamples = Number.parseInt(process.argv[2] ?? '60', 10)
if (!Number.isSafeInteger(requestedSamples) || requestedSamples < 1) {
  throw new Error('Sample count must be a positive integer')
}

const dataDirectory = await mkdtemp(join(tmpdir(), 'rev30-icon-search-benchmark-'))
const client = new PGlite(dataDirectory)

try {
  await client.waitReady
  const memoryEmptyPglite = process.memoryUsage()
  const diskEmptyPgliteBytes = await directorySize(dataDirectory)
  await migratePGlite(client)
  const database = drizzle({ client, relations })
  const iconRoutes = createIconRoutes(database, createAuthMiddleware(database))
  const [set] = await database
    .insert(customIconSets)
    .values({ prefix: 'benchmark', name: 'Benchmark', description: null })
    .returning()
  await database.insert(customIconSetIcons).values({
    setId: set!.id,
    name: 'business-icon',
    body: '<path d="M0 0h16v16H0z"/>',
    width: 16,
    height: 16,
    palette: false,
  })
  const businessRequest = async () => {
    const response = await iconRoutes.request('/benchmark.json?icons=business-icon')
    if (response.status !== 200) throw new Error(`Business route returned ${response.status}`)
    await response.arrayBuffer()
    return response
  }

  await measure({ phase: 'startup', kind: 'business-route' }, businessRequest)
  const businessBaseline: number[] = []
  for (let index = 0; index < requestedSamples; index += 1) {
    const startedAt = performance.now()
    await businessRequest()
    businessBaseline.push(performance.now() - startedAt)
  }
  emit({
    type: 'baseline-summary',
    kind: 'business-route',
    samples: requestedSamples,
    p95Ms: percentile95(businessBaseline),
  })
  const emptyBaseline: number[] = []
  for (let index = 0; index < requestedSamples; index += 1) {
    const startedAt = performance.now()
    const result = await browseBuiltinIcons({ keyword: '', pageSize: 60 })
    emptyBaseline.push(performance.now() - startedAt)
    if (result.list.length !== 60) throw new Error('Empty browse baseline returned too few icons')
  }
  emit({
    type: 'baseline-summary',
    kind: 'empty-browse',
    samples: requestedSamples,
    p95Ms: percentile95(emptyBaseline),
  })
  const memoryBusinessBaseline = process.memoryUsage()
  const diskBusinessBaselineBytes = await directorySize(dataDirectory)

  const initialImport = await runImportBenchmark(database, 'initial-import', businessRequest)
  const memoryAfterInitialImport = process.memoryUsage()
  const versionUpdate = await runImportBenchmark(database, 'version-update', businessRequest)
  const memoryAfterVersionUpdate = process.memoryUsage()

  await runReuseBenchmark(database, versionUpdate.manifest)

  await runSearchBenchmark(database, requestedSamples)
  await runPaginationBenchmark(database, requestedSamples)
  await runBurstBenchmark(database, requestedSamples)

  emit({
    type: 'environment-summary',
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    documents: initialImport.documentCount,
    memoryEmptyPglite,
    diskEmptyPgliteBytes,
    memoryBusinessBaseline,
    diskBusinessBaselineBytes,
    memoryAfterInitialImport,
    memoryAfterVersionUpdate,
    memoryAfterBenchmark: process.memoryUsage(),
    diskBytes: await directorySize(dataDirectory),
  })
} finally {
  await client.close()
  await rm(dataDirectory, { recursive: true })
}
