import { sql, type SQLWrapper } from 'drizzle-orm'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import type { Db } from '../../../src/db'
import { planIconSearchQuery } from '../../../src/modules/icons/search/planner'
import { findRankedIconSearchRows } from '../../../src/modules/icons/search/ranked-rows'
import { searchIconDocuments } from '../../../src/modules/icons/search/repository'
import { getIconSearchDictionary } from '../../../src/modules/icons/search/dictionary'
import { burstP95LimitMs, emit, percentile95, searchP95LimitMs, type QueryLatency } from './measure'

export const searchLimit = 60
const warmupSamples = 5
const cases: readonly {
  kind: string
  query: string
  page?: number
  conceptTargets?: 'intentEn' | 'exclude'
}[] = [
  { kind: 'english', query: 'file' },
  { kind: 'english', query: 'settings' },
  { kind: 'english', query: 'weather' },
  { kind: 'chinese-word', query: '铃铛' },
  { kind: 'chinese-word', query: '交通' },
  { kind: 'chinese-word', query: '动物' },
  { kind: 'chinese-compound', query: '打开文件夹' },
  { kind: 'intent', query: '通知', conceptTargets: 'intentEn' },
  { kind: 'exclude', query: '已锁定', conceptTargets: 'exclude' },
  { kind: 'mixed', query: 'lucide 铃铛' },
  { kind: 'wide', query: 'outline' },
  { kind: 'wide', query: 'co' },
  { kind: 'wide', query: 'icon' },
  { kind: 'wide', query: '用户' },
  { kind: 'wide', query: '箭头' },
  { kind: 'deep-pagination', query: 'icon', page: 10 },
]

async function findPageCursor(database: Db, query: string, page: number) {
  let cursor: string | undefined
  for (let currentPage = 1; currentPage < page; currentPage++) {
    const result = await searchIconDocuments(database, {
      keyword: query,
      limit: searchLimit,
      ...(cursor ? { cursor } : {}),
    })
    if (!result.nextCursor || result.nextCursor === cursor) {
      throw new Error(`${query} did not advance to page ${currentPage + 1}`)
    }
    cursor = result.nextCursor
  }
  return cursor
}

export async function runSearchBenchmark(database: Db, requestedSamples: number) {
  const summaries: QueryLatency[] = []
  const slowestByKind = new Map<string, QueryLatency>()
  for (const { kind, query, page, conceptTargets } of cases) {
    if (conceptTargets) {
      const plan = planIconSearchQuery(query, getIconSearchDictionary())
      if (plan.kind !== 'chinese' || !plan.exactConcept?.[conceptTargets].length) {
        throw new Error(`${query} must have ${conceptTargets} in the runtime dictionary`)
      }
    }
    const cursor = page ? await findPageCursor(database, query, page) : undefined
    const options = { keyword: query, limit: searchLimit, ...(cursor ? { cursor } : {}) }
    const minimumItems = kind === 'wide' || page ? searchLimit : 1
    for (let warmup = 0; warmup < warmupSamples; warmup++) {
      const result = await searchIconDocuments(database, options)
      if (result.rows.length < minimumItems) {
        throw new Error(`${query} returned fewer than ${minimumItems} benchmark results`)
      }
    }

    const samples: { elapsedMs: number; items: number }[] = []
    for (let index = 0; index < requestedSamples; index++) {
      const startedAt = performance.now()
      const result = await searchIconDocuments(database, options)
      samples.push({ elapsedMs: performance.now() - startedAt, items: result.rows.length })
    }
    const identity = { kind, query, ...(page ? { page } : {}) }
    const p95Ms = percentile95(samples.map(({ elapsedMs }) => elapsedMs))
    const summary = { ...identity, p95Ms }
    summaries.push(summary)
    const slowest = slowestByKind.get(kind)
    if (!slowest || p95Ms > slowest.p95Ms) slowestByKind.set(kind, summary)

    for (const sample of samples)
      emit({ type: 'sample', phase: 'warm-search', ...identity, ...sample })
    emit({
      type: 'search-summary',
      ...summary,
      samples: requestedSamples,
      warmupSamples,
      limit: searchLimit,
      targetMs: searchP95LimitMs,
      passed: p95Ms <= searchP95LimitMs,
    })
  }

  for (const { kind, query, page, p95Ms } of slowestByKind.values()) {
    emit({
      type: 'search-category-summary',
      kind,
      slowestQuery: query,
      ...(page ? { page } : {}),
      maxQueryP95Ms: p95Ms,
      targetMs: searchP95LimitMs,
      passed: p95Ms <= searchP95LimitMs,
    })
  }
  return summaries
}

export async function runBurstBenchmark(database: Db, requestedSamples: number) {
  const burstQueries = [
    'file',
    'settings',
    'outline',
    'co',
    'icon',
    '打开文件夹',
    '通知',
    '已锁定',
    'lucide 铃铛',
    '箭头',
  ]
  async function runBatch() {
    const batchStartedAt = performance.now()
    const requests = await Promise.all(
      burstQueries.map(async (query) => {
        const startedAt = performance.now()
        const result = await searchIconDocuments(database, { keyword: query, limit: searchLimit })
        return { query, elapsedMs: performance.now() - startedAt, items: result.rows.length }
      }),
    )
    return { elapsedMs: performance.now() - batchStartedAt, requests }
  }

  for (let warmup = 0; warmup < warmupSamples; warmup++) await runBatch()
  const batches = Math.max(30, requestedSamples)
  const samples: Awaited<ReturnType<typeof runBatch>>[] = []
  for (let batch = 0; batch < batches; batch++) samples.push(await runBatch())

  for (const [batch, { elapsedMs, requests }] of samples.entries()) {
    emit({ type: 'burst-batch', batch, elapsedMs })
    for (const request of requests) emit({ type: 'sample', phase: 'burst', batch, ...request })
  }
  const latency = {
    batchP95Ms: percentile95(samples.map(({ elapsedMs }) => elapsedMs)),
    requestP95Ms: percentile95(
      samples.flatMap(({ requests }) => requests.map(({ elapsedMs }) => elapsedMs)),
    ),
  }
  emit({
    type: 'burst-summary',
    composition: burstQueries,
    concurrency: burstQueries.length,
    limit: searchLimit,
    warmupBatches: warmupSamples,
    batches,
    requests: batches * burstQueries.length,
    ...latency,
    targetMs: burstP95LimitMs,
    passed: latency.batchP95Ms <= burstP95LimitMs,
  })
  return latency
}

export async function verifyTierZeroQueryPlan(database: Pick<PgliteDatabase, 'execute'>) {
  const query = '铃铛'
  const plan = planIconSearchQuery(query, getIconSearchDictionary())
  let statement: SQLWrapper | string | undefined
  await findRankedIconSearchRows(
    {
      execute: <Row extends Record<string, unknown>>(rankedStatement: SQLWrapper | string) => {
        statement ??= rankedStatement
        return database.execute<Row>(rankedStatement)
      },
    },
    plan,
    { limit: searchLimit },
  )
  if (!statement) throw new Error('Expected a Tier 0 SQL statement')
  const result = await database.execute<{ 'QUERY PLAN': string }>(
    sql`EXPLAIN (COSTS OFF) ${statement}`,
  )
  const queryPlan = result.rows.map((row) => row['QUERY PLAN'])
  const requiredIndexes = ['icon_search_documents_name_idx', 'icon_search_documents_exact_keys_gin']
  const usedIndexes = requiredIndexes.filter((index) =>
    queryPlan.some((line) => line.trimEnd().endsWith(`Scan on ${index}`)),
  )
  const passed = usedIndexes.length === requiredIndexes.length
  emit({ type: 'tier-0-plan', query, usedIndexes, passed, plan: queryPlan })
  if (!passed) throw new Error('Expected Tier 0 to use both the name and exact_keys indexes')
}
