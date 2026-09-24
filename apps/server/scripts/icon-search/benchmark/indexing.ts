import type { Db } from '../../../src/db'
import {
  defaultIconSearchArtifactDirectory,
  iterateIconSearchArtifacts,
  readIconSearchManifest,
} from '../../../src/modules/icons/search/artifacts/reader'
import type { IconSearchRuntimeManifest } from '../../../src/modules/icons/search/artifacts/schema'
import { prepareIconSearchIndex } from '../../../src/modules/icons/search/indexing/lifecycle'
import { searchIconDocuments } from '../../../src/modules/icons/search/repository'
import { emit, measure, percentile95, type Sample } from './measure'

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
            searchIconDocuments(database, { keyword: query, limit: 60 }),
          )
        : measure(sampleInput, businessRequest),
    )
  }, intervalMs)
  const startedAt = performance.now()
  let manifest: IconSearchRuntimeManifest
  let documentCount = 0
  let phaseSamples: Sample[]
  try {
    const directory = defaultIconSearchArtifactDirectory
    const sourceManifest = await readIconSearchManifest(directory)
    manifest = {
      ...sourceManifest,
      indexVersion: `${sourceManifest.indexVersion}-${phase}`,
      searchDataVersion: `${sourceManifest.searchDataVersion}-${phase}`,
    }
    await prepareIconSearchIndex(database, {
      installedIconPackageVersion: manifest.iconPackageVersion,
      loadArtifacts: async () => ({
        manifest,
        documents: (async function* () {
          for await (const document of iterateIconSearchArtifacts(directory, sourceManifest)) {
            documentCount++
            yield document
          }
        })(),
      }),
    })
  } finally {
    clearInterval(timer)
    phaseSamples = await Promise.all(periodic)
  }
  const elapsedMs = performance.now() - startedAt
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

export async function runReuseBenchmark(database: Db, manifest: IconSearchRuntimeManifest) {
  let artifactRead = false
  const reuseStartedAt = performance.now()
  const reuse = await prepareIconSearchIndex(database, {
    installedIconPackageVersion: manifest.iconPackageVersion,
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
}
