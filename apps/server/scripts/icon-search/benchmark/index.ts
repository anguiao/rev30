import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { findPackageJSON } from 'node:module'
import { cpus, release, tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { customIconSetIcons, customIconSets } from '../../../src/db/schema'
import { migratePGlite } from '../../../src/db/migrate'
import { relations } from '../../../src/db/relations'
import { createAuthMiddleware } from '../../../src/middleware/auth'
import { createIconRoutes } from '../../../src/modules/icons/routes'
import { browseBuiltinIcons } from '../../../src/modules/content/icon-sets/builtin/service'
import {
  getIconSearchDictionary,
  loadIconSearchDictionary,
} from '../../../src/modules/icons/search/dictionary'
import { reportIndexStorage, runImportBenchmark, runReuseBenchmark } from './indexing'
import { assertLatencyTargets, directorySize, emit, measure, percentile95 } from './measure'
import {
  runBurstBenchmark,
  runSearchBenchmark,
  searchLimit,
  verifyTierZeroQueryPlan,
} from './search'

const requestedSamples = Number(process.argv[2] ?? 60)
if (!Number.isSafeInteger(requestedSamples) || requestedSamples < 1) {
  throw new Error('Sample count must be a positive integer')
}

const dataDirectory = await mkdtemp(join(tmpdir(), 'rev30-icon-search-benchmark-'))
const client = new PGlite(dataDirectory)

try {
  await client.waitReady
  const logicalCpus = cpus()
  const pglitePackagePath = findPackageJSON('@electric-sql/pglite', import.meta.url)
  const { version: pgliteVersion } = JSON.parse(await readFile(pglitePackagePath!, 'utf8')) as {
    version: string
  }
  const postgres = await client.query<{ version: string }>('SELECT version()')
  emit({
    type: 'environment-summary',
    cpu: logicalCpus[0]?.model,
    logicalCpuCount: logicalCpus.length,
    memoryBytes: totalmem(),
    platform: `${process.platform}-${process.arch}`,
    osRelease: release(),
    node: process.version,
    pglite: pgliteVersion,
    postgres: postgres.rows[0]!.version,
  })
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
    const result = await browseBuiltinIcons({ keyword: '', pageSize: searchLimit })
    emptyBaseline.push(performance.now() - startedAt)
    if (result.list.length !== searchLimit)
      throw new Error('Empty browse baseline returned too few icons')
  }
  emit({
    type: 'baseline-summary',
    kind: 'empty-browse',
    samples: requestedSamples,
    p95Ms: percentile95(emptyBaseline),
  })
  const memoryBusinessBaseline = process.memoryUsage()
  const diskBusinessBaselineBytes = await directorySize(dataDirectory)

  await loadIconSearchDictionary()
  emit({
    type: 'dictionary-summary',
    queryRulesVersion: getIconSearchDictionary().queryRulesVersion,
  })
  await runImportBenchmark(database, 'initial-import', businessRequest)
  const memoryAfterInitialImport = process.memoryUsage()
  const manifest = await runImportBenchmark(database, 'version-update', businessRequest)
  const memoryAfterVersionUpdate = process.memoryUsage()
  await runReuseBenchmark(database, manifest)
  await reportIndexStorage(database, manifest)

  const queries = await runSearchBenchmark(database, requestedSamples)
  const burst = await runBurstBenchmark(database, requestedSamples)
  await verifyTierZeroQueryPlan(database)

  emit({
    type: 'resource-summary',
    memoryEmptyPglite,
    diskEmptyPgliteBytes,
    memoryBusinessBaseline,
    diskBusinessBaselineBytes,
    memoryAfterInitialImport,
    memoryAfterVersionUpdate,
    memoryAfterBenchmark: process.memoryUsage(),
    diskBytes: await directorySize(dataDirectory),
  })
  assertLatencyTargets(queries, burst)
} finally {
  await client.close()
  await rm(dataDirectory, { recursive: true })
}
