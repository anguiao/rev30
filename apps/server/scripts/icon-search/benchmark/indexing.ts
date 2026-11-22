import { sql } from 'drizzle-orm'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import type { Db } from '../../../src/db'
import { ICON_PACKAGE_VERSION } from '../../../src/modules/icons/builtin'
import {
  defaultIconSearchArtifactDirectory,
  iterateIconSearchArtifacts,
  readIconSearchManifest,
} from '../../../src/modules/icons/search/artifacts/reader'
import {
  checksum,
  type IconSearchRuntimeManifest,
} from '../../../src/modules/icons/search/artifacts/schema'
import { prepareIconSearchIndex } from '../../../src/modules/icons/search/indexing/lifecycle'
import { searchIconDocuments } from '../../../src/modules/icons/search/repository'
import { directorySize, emit, measure, percentile95, type Sample } from './measure'
import { searchLimit } from './search'

export async function runImportBenchmark(
  database: Db,
  phase: 'initial-import' | 'version-update',
  businessRequest: () => Promise<Response>,
) {
  const intervalMs = 25
  const periodic: Promise<Sample>[] = []
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
    const search = phase === 'version-update' && sequence % 2 === 1
    sequence += 1
    const sampleInput = {
      phase,
      kind: search ? 'queued-search' : 'business-route',
      ...(search ? { query } : {}),
      scheduledDelayMs,
    }
    periodic.push(
      search
        ? measure(sampleInput, async () =>
            searchIconDocuments(database, { keyword: query, limit: searchLimit }),
          )
        : measure(sampleInput, businessRequest),
    )
  }, intervalMs)
  const startedAt = performance.now()
  let manifest: IconSearchRuntimeManifest
  let elapsedMs: number
  let phaseSamples: Sample[]
  try {
    const directory = defaultIconSearchArtifactDirectory
    manifest = await readIconSearchManifest(directory)
    // Import identical documents with two identities to simulate a compatible update.
    const indexVersion =
      phase === 'initial-import'
        ? checksum(`${manifest.indexVersion}-benchmark`)
        : manifest.indexVersion
    const result = await prepareIconSearchIndex(database, {
      installedIconPackageVersion: ICON_PACKAGE_VERSION,
      loadArtifacts: async () => ({
        manifest: { ...manifest, indexVersion },
        documents: iterateIconSearchArtifacts(directory, manifest),
      }),
    })
    elapsedMs = performance.now() - startedAt
    if (result !== 'updated') throw new Error(`${phase} did not import the search artifacts`)
  } finally {
    clearInterval(timer)
    phaseSamples = await Promise.all(periodic)
  }
  emit({
    type: 'import-summary',
    phase,
    peakRss,
    peakHeapUsed,
    elapsedMs,
    builtinDocuments: manifest.counts.documents,
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
  return manifest
}

export async function runReuseBenchmark(database: Db, manifest: IconSearchRuntimeManifest) {
  let artifactRead = false
  const reuseStartedAt = performance.now()
  const reuse = await prepareIconSearchIndex(database, {
    installedIconPackageVersion: ICON_PACKAGE_VERSION,
    loadArtifacts: async () => ({
      manifest,
      documents: (async function* () {
        artifactRead = true
        yield* iterateIconSearchArtifacts(defaultIconSearchArtifactDirectory, manifest)
      })(),
    }),
  })
  emit({
    type: 'reuse-summary',
    result: reuse,
    artifactRead,
    elapsedMs: performance.now() - reuseStartedAt,
  })
  if (reuse !== 'reused' || artifactRead)
    throw new Error('Expected to reuse the committed search index')
}

export async function reportIndexStorage(
  database: Pick<PgliteDatabase, 'execute'>,
  manifest: IconSearchRuntimeManifest,
) {
  const result = await database.execute<{
    documents: number
    builtinDocuments: number
    tableBytes: number
    indexBytes: number
  }>(sql`
    SELECT count(*)::integer AS documents,
      (count(*) FILTER (WHERE source = 'builtin'))::integer AS "builtinDocuments",
      pg_table_size('icon_search_documents')::float8 AS "tableBytes",
      pg_indexes_size('icon_search_documents')::float8 AS "indexBytes"
    FROM icon_search_documents
  `)
  const [storage] = result.rows
  if (storage!.builtinDocuments !== manifest.counts.documents) {
    throw new Error(
      'The benchmark index must contain every builtin document in the artifact manifest',
    )
  }
  emit({ type: 'index-storage-summary', ...storage })
  emit({
    type: 'artifact-summary',
    iconPackageVersion: manifest.iconPackageVersion,
    indexVersion: manifest.indexVersion,
    collections: manifest.files.length,
    gzipBytes: manifest.files.reduce((bytes, file) => bytes + file.bytes, 0),
    directoryBytes: await directorySize(defaultIconSearchArtifactDirectory),
  })
}
