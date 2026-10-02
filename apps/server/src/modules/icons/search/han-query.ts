import { sql, type SQL } from 'drizzle-orm'
import type { DbExecutor } from '../../../db'
import type { SearchCursorPosition } from '../cursor'
import type { IconSearchMetadata } from './document'
import { expressionKey } from './expressions'
import { englishQuery, necessaryQueryConditions, textArray, type deriveQueryGraph } from './query'

type Graph = ReturnType<typeof deriveQueryGraph>
type Candidate = IconSearchMetadata & {
  preference: number
  fullTokens: string[]
  primaryTokens: string[]
  exactPhrases: string[]
  fullExpressions: string[]
  primaryExpressions: string[]
  exactExpressions: string[]
  rank: string
}
type Row = Omit<IconSearchMetadata, 'source'> & SearchCursorPosition

function bestHanScore(
  graph: Graph,
  document: Candidate,
): { level: number; primaryMatches: number } | undefined {
  const fullTokens = new Set(document.fullTokens)
  const primaryTokens = new Set(document.primaryTokens)
  const fullExpressions = new Set(document.fullExpressions)
  const primaryExpressions = new Set(document.primaryExpressions)
  // Candidate filtering already verifies the fixed original English conditions.
  const isEnglish = (key: string) => /^[a-z]+$/.test(key)
  const originalComplete = graph.tokens.every(
    (token) => fullTokens.has(token.key) || isEnglish(token.key),
  )
  const originalExact = originalComplete && document.exactPhrases.includes(graph.phrase)
  const wholeKey = expressionKey(graph.phrase)
  const expressionExact =
    fullExpressions.has(wholeKey) && document.exactExpressions.includes(wholeKey)
  if (originalExact || expressionExact) {
    const originalScore = originalExact
      ? new Set(
          graph.tokens
            .filter((token) => /\p{Script=Han}/u.test(token.key) && primaryTokens.has(token.key))
            .map((token) => token.key),
        ).size
      : 0
    return {
      level: 0,
      primaryMatches: Math.max(
        originalScore,
        expressionExact && primaryExpressions.has(wholeKey) ? 1 : 0,
      ),
    }
  }
  const labels = new Map<string, bigint>()
  const label = (key: string) => {
    if (!labels.has(key)) labels.set(key, 1n << BigInt(labels.size))
    return labels.get(key)!
  }
  const edges = [
    ...graph.tokens.flatMap((token, start) =>
      fullTokens.has(token.key) || isEnglish(token.key)
        ? [
            {
              start,
              end: start + 1,
              bit:
                /\p{Script=Han}/u.test(token.key) && primaryTokens.has(token.key)
                  ? label(token.key)
                  : 0n,
            },
          ]
        : [],
    ),
    ...graph.expressions.flatMap((expression) =>
      fullExpressions.has(expression.key)
        ? [
            {
              start: expression.start,
              end: expression.end,
              bit: primaryExpressions.has(expression.key) ? label(expression.key) : 0n,
            },
          ]
        : [],
    ),
  ]
  const count = graph.tokens.length
  const outgoing = Array.from({ length: count }, (_, position) =>
    edges.filter((edge) => edge.start === position),
  )
  const reachesEnd = Array<boolean>(count + 1).fill(false)
  reachesEnd[count] = true
  for (let position = count - 1; position >= 0; position--)
    reachesEnd[position] = outgoing[position]!.some((edge) => reachesEnd[edge.end])
  if (!reachesEnd[0]) return undefined
  const future = Array.from({ length: count + 1 }, (_, position) => {
    const costs = new Map<bigint, number>()
    for (const edge of edges) {
      if (edge.start < position || !edge.bit) continue
      costs.set(edge.bit, Math.min(costs.get(edge.bit) ?? Infinity, edge.end - edge.start))
    }
    return {
      mask: [...costs.keys()].reduce((mask, bit) => mask | bit, 0n),
      costs: [...costs].sort((left, right) => left[1] - right[1]),
    }
  })
  const visited = new Map<string, number>()
  let best = -1
  const visit = (position: number, active: bigint, score: number) => {
    if (position === count) {
      best = Math.max(best, score)
      return
    }
    // Every additional distinct condition needs at least its cheapest span.
    // Ignoring overlap makes this an upper bound, so pruning cannot lose a winner.
    let budget = count - position
    let upperBound = score
    for (const [bit, cost] of future[position]!.costs) {
      if (active & bit) continue
      if (cost > budget) break
      budget -= cost
      upperBound++
    }
    if (upperBound <= best) return
    const key = `${position}:${active}`
    if ((visited.get(key) ?? -1) >= score) return
    visited.set(key, score)
    const next = outgoing[position]!.filter((edge) => reachesEnd[edge.end]).sort((left, right) => {
      const leftNew = Boolean(left.bit && !(active & left.bit))
      const rightNew = Boolean(right.bit && !(active & right.bit))
      return Number(rightNew) - Number(leftNew) || left.end - right.end
    })
    for (const edge of next) {
      visit(
        edge.end,
        (active | edge.bit) & future[edge.end]!.mask,
        score + Number(Boolean(edge.bit && !(active & edge.bit))),
      )
      if (best >= upperBound) break
    }
  }
  visit(0, 0n, 0)
  return {
    level: graph.tokens.some((token) => isEnglish(token.key) && !fullTokens.has(token.key)) ? 2 : 1,
    primaryMatches: best,
  }
}

export function compareSearchPositions(left: SearchCursorPosition, right: SearchCursorPosition) {
  return (
    left.level - right.level ||
    right.primaryMatches - left.primaryMatches ||
    Math.fround(Number(right.rank)) - Math.fround(Number(left.rank)) ||
    right.preference - left.preference ||
    Buffer.compare(Buffer.from(left.id), Buffer.from(right.id))
  )
}

export async function findHanExpressionRows(
  executor: DbExecutor,
  graph: Graph,
  available: Set<string>,
  filters: SQL,
  limit: number,
  cursor?: SearchCursorPosition,
): Promise<Row[]> {
  const english = [
    ...new Set(graph.tokens.map((token) => token.key).filter((key) => /^[a-z]+$/.test(key))),
  ]
  const englishTsQuery = english.length
    ? sql`to_tsquery('simple', ${englishQuery(english)})`
    : sql`NULL::tsquery`
  const nonEnglish = [
    ...new Set(graph.tokens.map((token) => token.key).filter((key) => !/^[a-z]+$/.test(key))),
  ]
  const necessary = necessaryQueryConditions(graph, available)
  const result = await executor.execute<Candidate>(sql`
    SELECT id, prefix, name, source, collection, palette, custom_icon_id AS "customIconId", preference,
      full_tokens AS "fullTokens", primary_tokens AS "primaryTokens", exact_phrases AS "exactPhrases",
      full_expressions AS "fullExpressions", primary_expressions AS "primaryExpressions", exact_expressions AS "exactExpressions",
      (CASE WHEN ${englishTsQuery} IS NULL THEN 0::real ELSE ts_rank(search_vector, ${englishTsQuery}, 0) END)::text AS rank
    FROM icon_search_documents WHERE ${filters}
      AND ((full_tokens @> ${textArray(nonEnglish)} AND ${english.length ? sql`search_vector @@ ${englishTsQuery}` : sql`true`}) OR full_expressions && ${textArray([...available])})
      AND ${sql.join(necessary, sql` AND `)}
  `)
  const candidates = Array.isArray(result) ? result : result.rows
  const rows: Row[] = []
  for (const document of candidates) {
    const score = bestHanScore(graph, document)
    if (!score) continue
    const row = {
      id: document.id,
      prefix: document.prefix,
      name: document.name,
      collection: document.collection,
      palette: document.palette,
      customIconId: document.customIconId,
      ...score,
      rank: document.rank,
      preference: document.preference,
    }
    if (!cursor || compareSearchPositions(row, cursor) > 0) rows.push(row)
  }
  return rows.sort(compareSearchPositions).slice(0, limit + 1)
}
