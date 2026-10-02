import { normalizeSearchText } from '@rev30/utils'

export const fullHanExpressionPattern = /^\p{Script=Han}+(?: \p{Script=Han}+)*$/u

export function expressionKey(value: string): string {
  const normalized = normalizeSearchText(value)
  return fullHanExpressionPattern.test(normalized) ? normalized.replaceAll(' ', '') : normalized
}

export function matchesExpressionSource(owner: string, source: string): boolean {
  const text = normalizeSearchText(owner)
  const normalized = normalizeSearchText(source)
  if (!normalized) return false
  let start = text.indexOf(normalized)
  while (start !== -1) {
    const end = start + normalized.length
    if (
      (start === 0 || /[\s/-]/u.test(text[start - 1]!)) &&
      (end === text.length || /[\s/-]/u.test(text[end]!))
    )
      return true
    start = text.indexOf(normalized, start + 1)
  }
  return false
}

export function expressionKeys(values: readonly string[]): string[] {
  return [...new Set(values.map(expressionKey))].sort()
}
