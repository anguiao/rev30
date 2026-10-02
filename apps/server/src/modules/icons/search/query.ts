import { sql } from 'drizzle-orm'
import { normalizeSearchText } from '@rev30/utils'
import { expressionKey } from './expressions'

export function textArray(values: readonly string[]) {
  return sql`${`{${values.map((value) => JSON.stringify(value)).join(',')}}`}::text[]`
}

export function englishQuery(terms: readonly string[]): string {
  return terms.map((term) => (term.length >= 2 ? `${term}:*` : term)).join('&')
}

export function deriveQueryGraph(value: string) {
  const phrase = normalizeSearchText(value)
  const tokens: { key: string; start: number; end: number }[] = []
  for (const match of phrase.matchAll(/\S+/gu)) {
    const part = match[0]
    if (/^[a-z0-9]+(?:[-/]+[a-z0-9]+)+$/.test(part)) {
      for (const token of part.matchAll(/[a-z0-9]+/g))
        tokens.push({
          key: token[0],
          start: match.index + token.index,
          end: match.index + token.index + token[0].length,
        })
    } else if (/[\p{L}\p{N}]/u.test(part))
      tokens.push({ key: part, start: match.index, end: match.index + part.length })
  }
  const expressions: { key: string; start: number; end: number; whole: boolean }[] = []
  for (let start = 0; start < tokens.length; start++) {
    for (let end = start + 1; end <= tokens.length; end++) {
      const fragment = phrase.slice(tokens[start]!.start, tokens[end - 1]!.end)
      expressions.push({ key: expressionKey(fragment), start, end, whole: fragment === phrase })
    }
  }
  return { phrase, tokens, expressions }
}

export function necessaryQueryConditions(
  graph: ReturnType<typeof deriveQueryGraph>,
  available: Set<string>,
) {
  const seen = new Set<string>()
  return graph.tokens.flatMap((token, position) => {
    const covering = [
      ...new Set(
        graph.expressions
          .filter(
            (expression) =>
              expression.start <= position &&
              expression.end > position &&
              available.has(expression.key),
          )
          .map((expression) => expression.key),
      ),
    ].sort()
    const identity = JSON.stringify([token.key, covering])
    if (seen.has(identity)) return []
    seen.add(identity)
    const literal = /^[a-z]+$/.test(token.key)
      ? sql`search_vector @@ to_tsquery('simple', ${englishQuery([token.key])})`
      : sql`full_tokens @> ${textArray([token.key])}`
    return [
      covering.length ? sql`(${literal} OR full_expressions && ${textArray(covering)})` : literal,
    ]
  })
}

export function deriveQueryEdges(
  graph: ReturnType<typeof deriveQueryGraph>,
  available: Set<string>,
) {
  const expressions = graph.expressions.filter((entry) => available.has(entry.key))
  const english = [
    ...new Set(graph.tokens.map((token) => token.key).filter((key) => /^[a-z]+$/.test(key))),
  ]
  const chinese = [
    ...new Set(
      [
        ...graph.tokens.map((token) => expressionKey(token.key)),
        ...expressions.map((entry) => entry.key),
      ].filter((key) => /\p{Script=Han}/u.test(key)),
    ),
  ]
  const mask = (values: string[], key?: string) =>
    values.length ? values.map((value) => (value === key ? '1' : '0')).join('') : '0'
  const edges = [
    ...graph.tokens.map((token, index) => ({
      start: index,
      end: index + 1,
      key: token.key,
      expression: false,
      whole: false,
    })),
    ...expressions.map((entry) => ({ ...entry, expression: true })),
  ].map((entry) => ({
    ...entry,
    english_mask: mask(english, entry.expression ? undefined : entry.key),
    chinese_mask: mask(chinese, expressionKey(entry.key)),
    english_query:
      !entry.expression && /^[a-z]+$/.test(entry.key) ? englishQuery([entry.key]) : null,
  }))
  // Retire conditions after their last possible occurrence. Historical sets with
  // the same count then share a state without losing duplicate-sensitive scoring.
  const futureMasks = Array<string>(graph.tokens.length + 1).fill(mask(chinese))
  const byStart = Array.from({ length: graph.tokens.length }, () => new Set<string>())
  for (const edge of edges) byStart[edge.start]!.add(expressionKey(edge.key))
  const futureKeys = new Set<string>()
  for (let position = graph.tokens.length - 1; position >= 0; position--) {
    for (const key of byStart[position]!) futureKeys.add(key)
    futureMasks[position] = chinese.length
      ? chinese.map((key) => (futureKeys.has(key) ? '1' : '0')).join('')
      : '0'
  }
  const compactEdges = edges.map((edge) => ({
    ...edge,
    future_chinese_mask: futureMasks[edge.end]!,
  }))
  return { edges: compactEdges, english, emptyEnglish: mask(english), emptyChinese: mask(chinese) }
}
