import { and, not, or, sql, type SQL } from 'drizzle-orm'
import type { IconSearchConcept } from './concepts'
import type {
  ChineseIconSearchQuery,
  IconSearchQueryFragment,
  IconSearchQueryPlan,
  IconSearchQueryUnit,
} from './planner'
import { preferredIconPrefixes } from './rules'

type SearchTier = { tier: number; condition: SQL; matchScore: SQL }
type RankedQuery = { tiers: SearchTier[]; rank: SQL }

const always = sql`true`
const never = sql`false`
const zeroScore = sql`0`
const zeroRank = sql`0::real`

function all(conditions: readonly SQL[]): SQL {
  if (conditions.includes(never)) return never
  return and(...new Set(conditions.filter((condition) => condition !== always))) ?? always
}

function any(conditions: readonly SQL[]): SQL {
  if (conditions.includes(always)) return always
  return or(...new Set(conditions.filter((condition) => condition !== never))) ?? never
}

function below(candidate: SQL, ...higher: SQL[]): SQL {
  if (higher.includes(candidate)) return never
  return all([candidate, ...higher.filter((condition) => condition !== never).map(not)])
}

function textArray(values: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`
}

function overlaps(column: SQL, keys: readonly string[]): SQL {
  return keys.length ? sql`${column} && ${textArray(keys)}` : never
}

function namesMatch(names: readonly string[]): SQL {
  return names.length ? sql`name = ANY(${textArray(names)})` : never
}

function tsQuery(terms: string): SQL {
  return sql`to_tsquery('simple', ${terms})`
}

type SearchWeights = 'A' | 'AB' | 'ABC'

function englishOperand(target: string, weights: SearchWeights): string {
  return target.includes('-')
    ? `(${target
        .split('-')
        .map((lexeme) => `${lexeme}:A`)
        .join(' <-> ')})`
    : `${target}:${weights}`
}

function englishTargetsMatch(targets: readonly string[], weights: SearchWeights): SQL {
  if (!targets.length) return never
  return sql`search_vector @@ ${tsQuery(targets.map((target) => englishOperand(target, weights)).join(' | '))}`
}

type InferenceGuards = { allowed: SQL; undemoted: SQL }

function inferenceGuards(concept: IconSearchConcept, parent?: InferenceGuards): InferenceGuards {
  const excluded = englishTargetsMatch(concept.exclude, 'ABC')
  const demoted = concept.demoteCategories.length
    ? sql`category = ANY(${textArray(concept.demoteCategories)})`
    : never
  const allowed = all([parent?.allowed ?? always, excluded === never ? always : not(excluded)])
  const undemoted = all([
    allowed,
    parent?.undemoted ?? always,
    demoted === never ? always : not(demoted),
  ])
  return { allowed, undemoted }
}

type UnitEvidence = { primary: SQL; direct: SQL; related: SQL; withPrefix: SQL }

function conceptEvidence(
  key: string,
  concept: IconSearchConcept,
  guards: InferenceGuards,
): UnitEvidence {
  const keys = [...new Set([key, ...concept.zh])]
  const literal = overlaps(sql`tokens`, keys)
  const primary = any([
    overlaps(sql`primary_tokens`, keys),
    all([guards.undemoted, englishTargetsMatch(concept.en, 'AB')]),
  ])
  const direct = any([literal, all([guards.undemoted, englishTargetsMatch(concept.en, 'ABC')])])
  const related = any([
    literal,
    overlaps(sql`related_tokens`, keys),
    all([
      guards.allowed,
      englishTargetsMatch([...new Set([...concept.en, ...concept.intentEn])], 'ABC'),
    ]),
  ])
  return { primary, direct, related, withPrefix: related }
}

function unitEvidence(unit: IconSearchQueryUnit): UnitEvidence {
  if (unit.kind === 'han' && unit.concept) {
    const guards = inferenceGuards(unit.concept)
    const evidence = conceptEvidence(unit.key, unit.concept, guards)
    if (!unit.parts.length) return evidence

    const parts = unit.parts.map(({ key, concept }) =>
      conceptEvidence(key, concept, inferenceGuards(concept, guards)),
    )
    const direct = any([evidence.direct, all(parts.map((part) => part.direct))])
    const related = any([evidence.related, all(parts.map((part) => part.related))])
    return {
      primary: any([evidence.primary, all(parts.map((part) => part.primary))]),
      direct,
      related,
      withPrefix: related,
    }
  }

  const keys = textArray([unit.key])
  const literal = sql`tokens @> ${keys}`
  const primaryLiteral = sql`primary_tokens @> ${keys}`
  if (unit.kind === 'english' && unit.key.length >= 2) {
    const direct = any([literal, sql`search_vector @@ ${tsQuery(unit.key)}`])
    const primary = any([primaryLiteral, sql`search_vector @@ ${tsQuery(`${unit.key}:AB`)}`])
    const withPrefix = unit.prefix
      ? any([literal, sql`search_vector @@ ${tsQuery(`${unit.key}:*`)}`])
      : direct
    return { primary, direct, related: direct, withPrefix }
  }

  const related = unit.kind === 'han' ? any([literal, sql`related_tokens @> ${keys}`]) : literal
  return { primary: primaryLiteral, direct: literal, related, withPrefix: related }
}

function fragmentEvidence(fragment: IconSearchQueryFragment) {
  const units = fragment.units.map(unitEvidence)
  const unitsDirect = all(units.map((unit) => unit.direct))
  const unitsRelated = all(units.map((unit) => unit.related))
  const unitsWithPrefix = all(units.map((unit) => unit.withPrefix))
  const unitsScore = sql.join(
    units.map(({ primary }) => sql`(${primary})::integer`),
    sql` + `,
  )

  const fullDirect = any([
    overlaps(sql`exact_keys`, fragment.originalKeys),
    namesMatch(fragment.exactNames),
  ])
  const fullRelated = any([fullDirect, overlaps(sql`related_tokens`, fragment.originalKeys)])
  const score =
    fullRelated === never
      ? unitsScore
      : sql`GREATEST((${fullDirect})::integer, CASE WHEN ${unitsWithPrefix} THEN ${unitsScore} ELSE 0 END)`
  return {
    direct: any([unitsDirect, fullDirect]),
    related: any([unitsRelated, fullRelated]),
    withPrefix: any([unitsWithPrefix, fullRelated]),
    score,
  }
}

function exactChineseEvidence(plan: ChineseIconSearchQuery) {
  const literal = overlaps(sql`exact_keys`, [...new Set([plan.phrase, plan.compactKey])])
  const concept = plan.exactConcept
  const undemoted = concept ? inferenceGuards(concept).undemoted : always
  const direct = any([
    literal,
    namesMatch(plan.exactNames),
    all([undemoted, namesMatch(concept?.en ?? [])]),
  ])
  const condition = any([direct, all([undemoted, namesMatch(concept?.intentEn ?? [])])])
  const preferred = sql`prefix = ANY(${textArray(preferredIconPrefixes)})`
  const matchScore = sql`CASE
    WHEN (source = 'custom' AND ${literal}) OR (${preferred} AND ${direct}) THEN 3
    WHEN ${preferred} THEN 2
    WHEN ${direct} THEN 1
    ELSE 0
  END`
  return { tier: 0, condition, matchScore }
}

function chineseRank(fragments: readonly IconSearchQueryFragment[]): SQL {
  const explicit = new Map<string, boolean>()
  const inferred = new Map<string, 'A' | 'ABC'>()
  for (const { units, exactNames } of fragments) {
    for (const name of exactNames) {
      if (!inferred.has(name)) inferred.set(name, 'A')
    }
    for (const unit of units) {
      if (unit.kind === 'english') explicit.set(unit.key, unit.prefix)
      if (unit.kind !== 'han' || !unit.concept) continue
      for (const { en, intentEn } of [unit.concept, ...unit.parts.map(({ concept }) => concept)]) {
        for (const target of [...en, ...intentEn]) {
          inferred.set(target, target.includes('-') ? 'A' : 'ABC')
        }
      }
    }
  }
  const operands = [
    ...[...explicit].map(([key, prefix]) => (prefix ? `${key}:*` : key)),
    ...[...inferred].map(([target, weights]) => englishOperand(target, weights)),
  ]
  if (!operands.length) return zeroRank

  // ts_rank ignores a tsquery operand's weight restriction when scoring a lexeme.
  // Strip those positions unless a separate, less restricted operand can use them.
  const acceptsAllWeights = (lexeme: string) =>
    explicit.has(lexeme) || [...explicit].some(([key, prefix]) => prefix && lexeme.startsWith(key))
  const nameOnly = [...inferred].flatMap(([target, weights]) =>
    weights === 'A' ? target.split('-') : [],
  )
  const restricted = [...new Set([...nameOnly, ...inferred.keys()])].filter(
    (key) => !acceptsAllWeights(key),
  )
  const nameOnlyRestricted = [...new Set(nameOnly)].filter(
    (key) => inferred.get(key) !== 'ABC' && !acceptsAllWeights(key),
  )
  const rankQuery = tsQuery(operands.join(' | '))
  if (!restricted.length) return sql`ts_rank(search_vector, ${rankQuery}, 0)`

  const primary = nameOnlyRestricted.length
    ? sql`ts_filter(search_vector, '{A}'::"char"[]) ||
        ts_delete(ts_filter(search_vector, '{B,C}'::"char"[]), ${textArray(nameOnlyRestricted)})`
    : sql`ts_filter(search_vector, '{A,B,C}'::"char"[])`
  const rankVector = explicit.size
    ? sql`${primary} || ts_delete(ts_filter(search_vector, '{D}'::"char"[]), ${textArray(restricted)})`
    : primary
  return sql`ts_rank(${rankVector}, ${rankQuery}, 0)`
}

function compileChineseQuery(plan: ChineseIconSearchQuery): RankedQuery {
  const exact = exactChineseEvidence(plan)
  const fragments = plan.fragments.map(fragmentEvidence)
  const direct = all(fragments.map((fragment) => fragment.direct))
  const related = all(fragments.map((fragment) => fragment.related))
  const withPrefix = all(fragments.map((fragment) => fragment.withPrefix))
  const matchScore = sql.join(
    fragments.map(({ score }) => score),
    sql` + `,
  )
  const hasPrefix = plan.fragments.some(({ units }) =>
    units.some((unit) => unit.kind === 'english' && unit.prefix),
  )

  return {
    tiers: [
      exact,
      { tier: 1, condition: below(direct, exact.condition), matchScore },
      { tier: 2, condition: below(related, exact.condition, direct), matchScore },
      ...(hasPrefix
        ? [{ tier: 3, condition: below(withPrefix, exact.condition, related), matchScore }]
        : []),
    ].filter(({ condition }) => condition !== never),
    rank: chineseRank(plan.fragments),
  }
}

function compileEnglishQuery(plan: Extract<IconSearchQueryPlan, { kind: 'english' }>): RankedQuery {
  const exact = sql`exact_keys @> ${textArray([plan.phrase])}`
  const complete = sql`tokens @> ${textArray(plan.tokens)}`
  const tiers: SearchTier[] = [
    { tier: 0, condition: exact, matchScore: zeroScore },
    { tier: 1, condition: below(complete, exact), matchScore: zeroScore },
  ]
  if (!plan.englishTerms.length) return { tiers, rank: zeroRank }

  const query = tsQuery(
    plan.englishTerms.map((term) => (term.length >= 2 ? `${term}:*` : term)).join(' & '),
  )
  const literals = plan.tokens.filter((key) => !plan.englishTerms.includes(key))
  if (plan.englishTerms.some((term) => term.length >= 2)) {
    const prefix = all([
      sql`search_vector @@ ${query}`,
      sql`english_rank_vector @@ ${query}`,
      literals.length ? sql`tokens @> ${textArray(literals)}` : always,
    ])
    tiers.push({ tier: 2, condition: below(prefix, exact, complete), matchScore: zeroScore })
  }
  return { tiers, rank: sql`ts_rank(english_rank_vector, ${query}, 0)` }
}

export function compileRankedIconSearch(plan: IconSearchQueryPlan): RankedQuery {
  switch (plan.kind) {
    case 'empty':
      return { tiers: [], rank: zeroRank }
    case 'id':
      return {
        tiers: [{ tier: 0, condition: sql`id = ${plan.id}`, matchScore: zeroScore }],
        rank: zeroRank,
      }
    case 'english':
      return compileEnglishQuery(plan)
    case 'chinese':
      return compileChineseQuery(plan)
  }
}
