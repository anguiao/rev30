import { completeIconIdSchema } from '@rev30/contracts'
import { normalizeSearchText } from '@rev30/utils'
import type { IconSearchConcept, IconSearchConceptDictionary } from './concepts'
import { compactIconSearchKey, hanCharacterPattern } from './normalization'
import { deriveSearchText } from './text'

const maxExpandedUnits = 8
const englishWordPattern = /^[a-z]+$/
const queryFragmentPattern =
  /(?<!\S)(?:([一二三四五六1-6]) ?级 ?标题|标题 ?(?:级别 ?)?([1-6])|\S+)(?!\S)/gu
const mixedSpanPattern =
  /\p{Script=Han}+|([a-z0-9]+(?:[-/]+[a-z0-9]+)+)|[a-z]+|[0-9]+|[^\p{Script=Han}a-z0-9]+/gu

type ConceptPart = { key: string; concept: IconSearchConcept }

export type IconSearchQueryUnit =
  | { kind: 'han'; key: string; concept?: IconSearchConcept; parts: readonly ConceptPart[] }
  | { kind: 'english'; key: string; prefix: boolean }
  | { kind: 'literal'; key: string }

export type IconSearchQueryFragment = {
  // A match must satisfy every unit or one of the full-fragment alternatives.
  units: readonly IconSearchQueryUnit[]
  originalKeys: readonly string[]
  exactNames: readonly string[]
}

export type ChineseIconSearchQuery = {
  kind: 'chinese'
  phrase: string
  compactKey: string
  fragments: readonly IconSearchQueryFragment[]
  exactConcept?: IconSearchConcept
  exactNames: readonly string[]
}

export type IconSearchQueryPlan =
  | { kind: 'empty' }
  | { kind: 'id'; id: string }
  | { kind: 'english'; phrase: string; tokens: readonly string[]; englishTerms: readonly string[] }
  | ChineseIconSearchQuery

type DraftUnit =
  | { kind: 'han'; key: string; concept: IconSearchConcept | undefined }
  | { kind: 'english' | 'literal'; key: string }

type DraftFragment = {
  text: string
  units: DraftUnit[]
  exactNames: string[]
}

function longestConcept(span: string, start: number, dictionary: IconSearchConceptDictionary) {
  for (let end = Math.min(span.length, start + dictionary.maxKeyLength); end > start; end--) {
    const concept = dictionary.byKey.get(span.slice(start, end))
    if (concept) return { end, concept }
  }
}

function segmentHan(span: string, dictionary: IconSearchConceptDictionary): DraftUnit[] {
  const units: DraftUnit[] = []
  let unmatchedStart = 0
  let start = 0
  while (start < span.length) {
    const match = longestConcept(span, start, dictionary)
    if (!match) {
      start++
      continue
    }
    if (unmatchedStart < start) {
      units.push({ kind: 'han', key: span.slice(unmatchedStart, start), concept: undefined })
    }
    units.push({ kind: 'han', key: span.slice(start, match.end), concept: match.concept })
    start = match.end
    unmatchedStart = start
  }
  if (unmatchedStart < span.length) {
    units.push({ kind: 'han', key: span.slice(unmatchedStart), concept: undefined })
  }
  return units
}

function nonHanUnit(key: string): DraftUnit {
  return { kind: englishWordPattern.test(key) ? 'english' : 'literal', key }
}

function segmentFragment(text: string, dictionary: IconSearchConceptDictionary): DraftUnit[] {
  const concept = dictionary.byKey.get(text)
  if (concept) return [{ kind: 'han', key: text, concept }]

  if (!hanCharacterPattern.test(text)) {
    const { tokens } = deriveSearchText(text)
    return (tokens.length ? tokens : [text]).map(nonHanUnit)
  }

  return [...text.matchAll(mixedSpanPattern)].flatMap(([span, compound]) => {
    if (hanCharacterPattern.test(span)) return segmentHan(span, dictionary)
    return compound ? compound.split(/[-/]+/).map(nonHanUnit) : [nonHanUnit(span)]
  })
}

function draftFragments(phrase: string, dictionary: IconSearchConceptDictionary): DraftFragment[] {
  return [...phrase.matchAll(queryFragmentPattern)].map(([text, ordinal, digit]) => {
    const level = ordinal ?? digit
    if (!level) return { text, units: segmentFragment(text, dictionary), exactNames: [] }

    const number = /^[1-6]$/.test(level) ? level : String('一二三四五六'.indexOf(level) + 1)
    return {
      text,
      units: [
        { kind: 'han', key: '标题', concept: dictionary.byKey.get('标题') },
        { kind: 'literal', key: number },
      ],
      exactNames: [`heading-${number}`, `h-${number}`, `h${number}`],
    }
  })
}

function matchedConcept(unit: DraftUnit | undefined): IconSearchConcept | undefined {
  return unit?.kind === 'han' ? unit.concept : undefined
}

function compileFragments(
  drafts: readonly DraftFragment[],
  dictionary: IconSearchConceptDictionary,
): IconSearchQueryFragment[] {
  const allUnits = drafts.flatMap(({ units }) => units)
  const expanded = new Set<string | IconSearchConcept>()
  let offset = 0

  return drafts.flatMap(({ text, units, exactNames }) => {
    let allowExactNames = true
    const compiled = units.flatMap<IconSearchQueryUnit>((unit, index) => {
      const { key } = unit
      const concept = matchedConcept(unit)
      const position = offset + index
      if (
        key === '的' &&
        !concept &&
        matchedConcept(allUnits[position - 1]) &&
        matchedConcept(allUnits[position + 1])
      ) {
        return []
      }

      const identity = concept ?? key
      const allowExpansion = expanded.has(identity) || expanded.size < maxExpandedUnits
      if (allowExpansion) expanded.add(identity)
      else allowExactNames = false
      if (unit.kind === 'english') {
        return [{ kind: 'english', key, prefix: allowExpansion && key.length >= 2 }]
      }
      if (unit.kind === 'literal') return [{ kind: 'literal', key }]
      if (!allowExpansion || !concept) return [{ kind: 'han', key, parts: [] }]
      const parts = concept.parts.map((part) => ({
        key: part,
        concept: dictionary.byKey.get(part)!,
      }))
      return [{ kind: 'han', key, concept, parts }]
    })
    offset += units.length
    if (compiled.length === 0) return []

    const originalKeys =
      units.length > 1 && hanCharacterPattern.test(text)
        ? [...new Set([text, compactIconSearchKey(text)])]
        : []
    return [{ units: compiled, originalKeys, exactNames: allowExactNames ? exactNames : [] }]
  })
}

export function planIconSearchQuery(
  keyword: string,
  dictionary: IconSearchConceptDictionary,
): IconSearchQueryPlan {
  const phrase = normalizeSearchText(keyword)
  if (completeIconIdSchema.safeParse(phrase).success) return { kind: 'id', id: phrase }

  if (!hanCharacterPattern.test(phrase)) {
    const text = deriveSearchText(phrase)
    return text.tokens.length > 0 ? { kind: 'english', ...text } : { kind: 'empty' }
  }

  const compactKey = compactIconSearchKey(phrase)
  const exactConcept = dictionary.byKey.get(compactKey)
  const drafts: DraftFragment[] = exactConcept
    ? [
        {
          text: phrase,
          units: [{ kind: 'han', key: compactKey, concept: exactConcept }],
          exactNames: [],
        },
      ]
    : draftFragments(phrase, dictionary)
  const fragments = compileFragments(drafts, dictionary)
  return {
    kind: 'chinese',
    phrase,
    compactKey,
    fragments,
    ...(exactConcept ? { exactConcept } : {}),
    exactNames: fragments.length === 1 ? fragments[0]!.exactNames : [],
  }
}
