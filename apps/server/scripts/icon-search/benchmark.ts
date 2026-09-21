import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { customIconSetIcons, customIconSets } from '../../src/db/schema'
import { migratePGlite } from '../../src/db/migrate'
import { relations } from '../../src/db/relations'
import { createIconRoutes } from '../../src/modules/icons/routes'
import { browseBuiltinIcons } from '../../src/modules/content/icon-sets/builtin/service'
import {
  getDefaultIconSearchArtifactDirectory,
  iterateIconSearchArtifacts,
  readIconSearchManifest,
} from '../../src/modules/icons/search/artifacts/reader'
import { type IconSearchRuntimeManifest } from '../../src/modules/icons/search/artifacts/schema'
import { prepareIconSearchIndex } from '../../src/modules/icons/search/lifecycle'
import { searchIconDocuments } from '../../src/modules/icons/search/query-repository'

type Sample = {
  phase: string
  kind: string
  query?: string
  elapsedMs: number
  items?: number
  status?: number
  scheduledDelayMs?: number
}

const requestedSamples = Number.parseInt(process.argv[2] ?? '60', 10)
if (!Number.isSafeInteger(requestedSamples) || requestedSamples < 1) {
  throw new Error('Sample count must be a positive integer')
}

function emit(value: object) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function percentile95(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0
}

async function directorySize(path: string): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true })
  let total = 0
  for (const entry of entries) {
    const entryPath = join(path, entry.name)
    total += entry.isDirectory() ? await directorySize(entryPath) : (await stat(entryPath)).size
  }
  return total
}

async function measure<T>(
  samples: Sample[],
  input: Omit<Sample, 'elapsedMs'>,
  operation: () => Promise<T>,
) {
  const startedAt = performance.now()
  const result = await operation()
  const sample = { ...input, elapsedMs: performance.now() - startedAt }
  samples.push(sample)
  emit({ type: 'sample', ...sample })
  return result
}

const dataDirectory = await mkdtemp(join(tmpdir(), 'rev30-icon-search-benchmark-'))
const client = new PGlite(dataDirectory)
const samples: Sample[] = []

try {
  await client.waitReady
  const memoryEmptyPglite = process.memoryUsage()
  const diskEmptyPgliteBytes = await directorySize(dataDirectory)
  await migratePGlite(client)
  const database = drizzle({ client, relations })
  const iconRoutes = createIconRoutes(database)
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

  await measure(samples, { phase: 'startup', kind: 'business-route' }, businessRequest)
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
  async function runImport(phase: 'initial-import' | 'version-update', mixedSearch: boolean) {
    const intervalMs = 25
    const periodic: Promise<unknown>[] = []
    let previousTick = performance.now()
    let sequence = 0
    let peakRss = process.memoryUsage().rss
    let peakHeapUsed = process.memoryUsage().heapUsed
    const timer = setInterval(() => {
      const startedAt = performance.now()
      const memory = process.memoryUsage()
      peakRss = Math.max(peakRss, memory.rss)
      peakHeapUsed = Math.max(peakHeapUsed, memory.heapUsed)
      const scheduledDelayMs = Math.max(0, startedAt - previousTick - intervalMs)
      previousTick = startedAt
      const query = ['file', 'outline', 'co', 'icon'][sequence % 4]!
      const search = mixedSearch && sequence % 2 === 1
      sequence += 1
      const sampleInput = {
        phase,
        kind: search ? 'queued-search' : 'business-route',
        ...(search ? { query } : {}),
        scheduledDelayMs,
      }
      periodic.push(
        search
          ? measure(samples, sampleInput, async () =>
              searchIconDocuments(database, { query, limit: 60 }),
            )
          : measure(samples, sampleInput, businessRequest),
      )
    }, intervalMs)
    const startedAt = performance.now()
    let manifest: IconSearchRuntimeManifest
    let documentCount = 0
    try {
      const directory = getDefaultIconSearchArtifactDirectory()
      manifest = await readIconSearchManifest(directory)
      await prepareIconSearchIndex(database, {
        manifest: {
          ...manifest,
          indexVersion: `${manifest.indexVersion}-${phase}`,
          searchDataVersion: `${manifest.searchDataVersion}-${phase}`,
        },
        readDocuments: async function* () {
          for await (const document of iterateIconSearchArtifacts(directory, manifest)) {
            documentCount++
            yield document
          }
        },
      })
    } finally {
      clearInterval(timer)
      await Promise.all(periodic)
    }
    const elapsedMs = performance.now() - startedAt
    const phaseSamples = samples.filter((sample) => sample.phase === phase)
    emit({
      type: 'import-summary',
      phase,
      peakRss,
      peakHeapUsed,
      elapsedMs,
      periodicRequests: phaseSamples.length,
      maxScheduledDelayMs: Math.max(...phaseSamples.map((sample) => sample.scheduledDelayMs ?? 0)),
      businessRouteEndToEndP95Ms: percentile95(
        phaseSamples
          .filter((sample) => sample.kind === 'business-route')
          .map((sample) => sample.elapsedMs + (sample.scheduledDelayMs ?? 0)),
      ),
      businessRouteP95Ms: percentile95(
        phaseSamples
          .filter((sample) => sample.kind === 'business-route')
          .map((sample) => sample.elapsedMs),
      ),
      queuedSearchP95Ms: percentile95(
        phaseSamples
          .filter((sample) => sample.kind === 'queued-search')
          .map((sample) => sample.elapsedMs),
      ),
    })
    return { manifest, documentCount }
  }

  const initialImport = await runImport('initial-import', false)
  const memoryAfterInitialImport = process.memoryUsage()
  const versionUpdate = await runImport('version-update', true)
  const memoryAfterVersionUpdate = process.memoryUsage()

  let artifactRead = false
  const reuseStartedAt = performance.now()
  const reuse = await prepareIconSearchIndex(database, {
    manifest: {
      ...versionUpdate.manifest,
      indexVersion: `${versionUpdate.manifest.indexVersion}-version-update`,
      searchDataVersion: `${versionUpdate.manifest.searchDataVersion}-version-update`,
    },
    readDocuments: async () => {
      artifactRead = true
      return []
    },
  })
  emit({
    type: 'reuse-summary',
    result: reuse,
    artifactRead,
    elapsedMs: performance.now() - reuseStartedAt,
  })

  const cases = [
    { kind: 'english', query: 'file' },
    { kind: 'english', query: 'settings' },
    { kind: 'wide', query: 'outline' },
    { kind: 'wide', query: 'co' },
    { kind: 'wide', query: 'icon' },
    { kind: 'chinese', query: '铃铛' },
    { kind: 'mixed', query: 'lucide 铃铛' },
  ] as const
  for (const benchmarkCase of cases) {
    for (let warmup = 0; warmup < 2; warmup += 1) {
      await searchIconDocuments(database, { query: benchmarkCase.query, limit: 60 })
    }
    const caseSamples: number[] = []
    for (let index = 0; index < requestedSamples; index += 1) {
      const startedAt = performance.now()
      const result = await searchIconDocuments(database, {
        query: benchmarkCase.query,
        limit: 60,
      })
      const elapsedMs = performance.now() - startedAt
      caseSamples.push(elapsedMs)
      emit({
        type: 'sample',
        phase: 'warm-search',
        kind: benchmarkCase.kind,
        query: benchmarkCase.query,
        elapsedMs,
        items: result.rows.length,
      })
    }
    emit({
      type: 'search-summary',
      kind: benchmarkCase.kind,
      query: benchmarkCase.query,
      samples: requestedSamples,
      p95Ms: percentile95(caseSamples),
    })
  }

  const firstPage = await searchIconDocuments(database, { query: 'icon', limit: 60 })
  if (!firstPage.nextCursor) throw new Error('Pagination benchmark requires a second page')
  const pageSamples: number[] = []
  for (let index = 0; index < requestedSamples; index += 1) {
    const startedAt = performance.now()
    const result = await searchIconDocuments(database, {
      query: 'icon',
      limit: 60,
      cursor: firstPage.nextCursor,
    })
    const elapsedMs = performance.now() - startedAt
    pageSamples.push(elapsedMs)
    emit({
      type: 'sample',
      phase: 'pagination',
      kind: 'page-2',
      query: 'icon',
      elapsedMs,
      items: result.rows.length,
    })
  }
  emit({ type: 'pagination-summary', query: 'icon', p95Ms: percentile95(pageSamples) })

  const burstQueries = [
    'file',
    'settings',
    'outline',
    'co',
    'icon',
    'file',
    'settings',
    'outline',
    'co',
    'icon',
  ]
  const burstSamples: number[] = []
  const burstCount = Math.max(1, Math.ceil(requestedSamples / burstQueries.length))
  for (let batch = 0; batch < burstCount; batch += 1) {
    await Promise.all(
      burstQueries.map(async (query) => {
        const startedAt = performance.now()
        const result = await searchIconDocuments(database, { query, limit: 60 })
        const elapsedMs = performance.now() - startedAt
        burstSamples.push(elapsedMs)
        emit({
          type: 'sample',
          phase: 'burst',
          kind: 'balanced',
          query,
          batch,
          elapsedMs,
          items: result.rows.length,
        })
      }),
    )
    await delay(0)
  }
  emit({
    type: 'burst-summary',
    composition: burstQueries,
    requests: burstSamples.length,
    p95Ms: percentile95(burstSamples),
  })

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
