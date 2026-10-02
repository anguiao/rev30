import { sql, type SQL } from 'drizzle-orm'
import type { DbExecutor } from '../../../db'
import type { SearchCursorPosition } from '../cursor'
import type { IconSearchMetadata } from './document'
import {
  deriveQueryEdges,
  deriveQueryGraph,
  englishQuery,
  necessaryQueryConditions,
  textArray,
} from './query'
import { deriveSearchText } from './text'
import { fullHanExpressionPattern } from './expressions'
import { compareSearchPositions, findHanExpressionRows } from './han-query'

type SearchRow = Omit<IconSearchMetadata, 'source'> & SearchCursorPosition

export async function findExpressionSearchRows(
  executor: DbExecutor,
  keyword: string,
  filters: SQL,
  limit: number,
  cursor?: SearchCursorPosition,
): Promise<SearchRow[] | undefined> {
  const graph = deriveQueryGraph(keyword)
  const keys = [...new Set(graph.expressions.map((entry) => entry.key))]
  if (!keys.length) return undefined
  const availableResult = await executor.execute<{ key: string }>(sql`
    SELECT expression.key FROM unnest(${textArray(keys)}) AS expression(key)
    WHERE EXISTS (SELECT 1 FROM icon_search_documents WHERE ${filters}
      AND full_expressions @> ARRAY[expression.key])
  `)
  const available = new Set(
    (Array.isArray(availableResult) ? availableResult : availableResult.rows).map((row) => row.key),
  )
  if (!available.size) return undefined
  const nonHanKeys = [...available].filter((key) => !fullHanExpressionPattern.test(key))
  // Partition documents, not paths: unrelated English expressions must not
  // disable fixed-English scoring for a document that only owns Han expressions.
  let fixedRows: SearchRow[] = []
  if (graph.tokens.length > 1) {
    if (!nonHanKeys.length)
      return findHanExpressionRows(executor, graph, available, filters, limit, cursor)
    fixedRows = await findHanExpressionRows(
      executor,
      graph,
      new Set([...available].filter((key) => fullHanExpressionPattern.test(key))),
      sql`(${filters}) AND NOT full_expressions && ${textArray(nonHanKeys)}`,
      limit,
      cursor,
    )
    filters = sql`(${filters}) AND full_expressions && ${textArray(nonHanKeys)}`
  }
  const { edges, english, emptyEnglish, emptyChinese } = deriveQueryEdges(graph, available)
  const { phrase, tokens, englishTerms } = deriveSearchText(keyword)
  const chinese = tokens.filter((token) => /\p{Script=Han}/u.test(token))
  const primaryMatches = chinese.length
    ? sql.join(
        chinese.map((token) => sql`(primary_tokens @> ${textArray([token])})::integer`),
        sql` + `,
      )
    : sql`0`
  const query = englishTerms.length
    ? sql`to_tsquery('simple', ${englishQuery(englishTerms)})`
    : sql`NULL::tsquery`
  const nonEnglish = tokens.filter((token) => !/^[a-z]+$/.test(token))
  const literalCondition = sql`${englishTerms.length ? sql`search_vector @@ ${query}` : sql`true`} AND full_tokens @> ${textArray(nonEnglish)}`
  const necessary = necessaryQueryConditions(graph, available)
  const cursorFilter = cursor
    ? sql`WHERE (
    level > ${cursor.level} OR (level = ${cursor.level} AND (
      primary_matches < ${cursor.primaryMatches} OR (primary_matches = ${cursor.primaryMatches} AND (
        rank < ${cursor.rank}::real OR (rank = ${cursor.rank}::real AND preference < ${cursor.preference}) OR
        (rank = ${cursor.rank}::real AND preference = ${cursor.preference} AND id COLLATE "C" > ${cursor.id})
      ))
    ))
  )`
    : sql``
  const expressionScores =
    graph.tokens.length === 1
      ? sql`
    SELECT ctid AS row_id, id,
      CASE WHEN ${graph.expressions[0]!.whole} AND exact_expressions @> ${textArray([keys[0]!])} THEN 0 ELSE 1 END AS level,
      ${/\p{Script=Han}/u.test(keys[0]!) ? sql`(primary_expressions @> ${textArray([keys[0]!])})::integer` : sql`0`} AS primary_matches,
      0::real AS rank, preference
    FROM icon_search_documents WHERE ${filters} AND full_expressions @> ${textArray([keys[0]!])}
  `
      : sql`
    SELECT document.ctid AS row_id, document.id,
      CASE WHEN path.exact_expression THEN 0 WHEN path.prefix_used THEN 2 ELSE 1 END AS level,
      (path.closed_count + bit_count(path.chinese_mask::varbit))::integer AS primary_matches,
      CASE WHEN path.english_mask = ${emptyEnglish}::text THEN 0::real ELSE ts_rank(document.search_vector,
        to_tsquery('simple', (SELECT string_agg(term.query, '&' ORDER BY term.ordinality) FROM unnest(${textArray(english.map((term) => englishQuery([term])))}) WITH ORDINALITY AS term(query, ordinality) WHERE get_bit(path.english_mask::varbit, term.ordinality::integer - 1) = 1)), 0) END AS rank,
      document.preference
    FROM paths path JOIN expression_candidates document ON document.id = path.id
    WHERE path.position = ${graph.tokens.length} AND path.used_expression
  `
  const recursive =
    graph.tokens.length === 1
      ? sql``
      : sql`
    expression_candidates AS MATERIALIZED (
      SELECT ctid, id, preference, full_tokens, primary_tokens, full_expressions, primary_expressions, exact_expressions, search_vector
      FROM icon_search_documents WHERE ${filters} AND full_expressions && ${textArray([...available])}
        AND ${sql.join(necessary, sql` AND `)}
    ), edges AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(edges)}::jsonb) AS edge(start integer, "end" integer, key text, expression boolean, whole boolean, english_mask varbit, chinese_mask varbit, future_chinese_mask varbit, english_query text)
    ), paths(id, position, prefix_used, english_mask, chinese_mask, used_expression, exact_expression, closed_count) AS (
      SELECT id, 0, false, ${emptyEnglish}::text, ${emptyChinese}::text, false, false, 0 FROM expression_candidates
      UNION
      SELECT path.id, edge."end",
        path.prefix_used OR (NOT edge.expression AND NOT document.full_tokens @> ARRAY[edge.key]),
        (path.english_mask::varbit | edge.english_mask)::text,
        (matched.mask & edge.future_chinese_mask)::text,
        path.used_expression OR edge.expression,
        path.exact_expression OR (edge.expression AND edge.whole AND document.exact_expressions @> ARRAY[edge.key]),
        path.closed_count + bit_count(matched.mask & ~edge.future_chinese_mask)::integer
      FROM paths path JOIN edges edge ON edge.start = path.position JOIN expression_candidates document ON document.id = path.id
      CROSS JOIN LATERAL (SELECT path.chinese_mask::varbit | CASE WHEN (CASE WHEN edge.expression THEN document.primary_expressions ELSE document.primary_tokens END) @> ARRAY[edge.key] THEN edge.chinese_mask ELSE ${emptyChinese}::varbit END AS mask) matched
      WHERE CASE WHEN edge.expression THEN document.full_expressions @> ARRAY[edge.key]
        ELSE document.full_tokens @> ARRAY[edge.key] OR (edge.english_query IS NOT NULL AND document.search_vector @@ to_tsquery('simple', edge.english_query)) END
    ),
  `
  const result = await executor.execute<SearchRow>(sql`
    WITH RECURSIVE ${recursive} scored AS (
      SELECT ctid AS row_id, id,
        CASE WHEN exact_phrases @> ${textArray([phrase])} THEN 0 WHEN full_tokens @> ${textArray(tokens)} THEN 1 ELSE 2 END AS level,
        (${primaryMatches}) AS primary_matches,
        CASE WHEN ${query} IS NULL THEN 0::real ELSE ts_rank(search_vector, ${query}, 0) END AS rank,
        preference FROM icon_search_documents WHERE ${filters} AND (${literalCondition})
      UNION ALL ${expressionScores}
    ), best AS (
      SELECT DISTINCT ON (id) * FROM scored ORDER BY id, level, primary_matches DESC, rank DESC, preference DESC
    ), page AS (
      SELECT * FROM best ${cursorFilter}
      ORDER BY level, primary_matches DESC, rank DESC, preference DESC, id COLLATE "C" ASC LIMIT ${limit + 1}
    )
    SELECT document.id, document.prefix, document.name, document.collection, document.palette, document.custom_icon_id AS "customIconId",
      page.level, page.primary_matches AS "primaryMatches", page.rank::text AS rank, page.preference
    FROM page JOIN icon_search_documents document ON document.ctid = page.row_id
    ORDER BY page.level, page.primary_matches DESC, page.rank DESC, page.preference DESC, page.id COLLATE "C" ASC
  `)
  const rows = Array.isArray(result) ? result : result.rows
  // The partitions have disjoint IDs and already contain each document's best
  // path. Their first limit+1 entries contain the global first limit+1 entries.
  return [...fixedRows, ...rows].sort(compareSearchPositions).slice(0, limit + 1)
}
