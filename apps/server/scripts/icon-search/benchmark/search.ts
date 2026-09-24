import { setTimeout as delay } from 'node:timers/promises'
import type { Db } from '../../../src/db'
import { searchIconDocuments } from '../../../src/modules/icons/search/repository'
import { emit, percentile95 } from './measure'

export async function runSearchBenchmark(database: Db, requestedSamples: number) {
  const cases = [
    { kind: 'english', query: 'file' },
    { kind: 'english', query: 'settings' },
    { kind: 'wide', query: 'outline' },
    { kind: 'wide', query: 'co' },
    { kind: 'wide', query: 'icon' },
    { kind: 'chinese', query: '铃铛' },
    { kind: 'chinese-wide', query: '用户' },
    { kind: 'chinese-wide', query: '箭头' },
    { kind: 'mixed', query: 'lucide 铃铛' },
    { kind: 'category-english', query: 'weather' },
    { kind: 'category-chinese', query: '交通' },
    { kind: 'category-chinese', query: '动物' },
  ] as const
  for (const benchmarkCase of cases) {
    for (let warmup = 0; warmup < 2; warmup += 1) {
      await searchIconDocuments(database, { keyword: benchmarkCase.query, limit: 60 })
    }
    const caseSamples: number[] = []
    for (let index = 0; index < requestedSamples; index += 1) {
      const startedAt = performance.now()
      const result = await searchIconDocuments(database, {
        keyword: benchmarkCase.query,
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
}

export async function runPaginationBenchmark(database: Db, requestedSamples: number) {
  const firstPage = await searchIconDocuments(database, { keyword: 'icon', limit: 60 })
  if (!firstPage.nextCursor) throw new Error('Pagination benchmark requires a second page')
  const pageSamples: number[] = []
  for (let index = 0; index < requestedSamples; index += 1) {
    const startedAt = performance.now()
    const result = await searchIconDocuments(database, {
      keyword: 'icon',
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
}

export async function runBurstBenchmark(database: Db, requestedSamples: number) {
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
        const result = await searchIconDocuments(database, { keyword: query, limit: 60 })
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
}
