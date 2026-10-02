import { describe, expect, it } from 'vitest'
import {
  expressionKey,
  matchesExpressionSource,
} from '../../../../src/modules/icons/search/expressions'
import {
  deriveIconSearchDocument,
  deriveCustomIconSearchDocument,
} from '../../../../src/modules/icons/search/document'

describe('owned search expressions', () => {
  it('normalizes only complete Han expressions across spaces and preserves English separators', () => {
    expect(expressionKey('打 开\u3000文件夹')).toBe(expressionKey('打开文件夹'))
    expect(expressionKey('ＳＩＧＮ　ＯＵＴ')).toBe(expressionKey('sign out'))
    for (const [left, right] of [
      ['sign-out', 'sign out'],
      ['logout', 'log out'],
      ['版本 2', '版本2'],
      ['中 en', '中en'],
      ['打，开', '打开'],
    ]) {
      expect(expressionKey(left!)).not.toBe(expressionKey(right!))
    }
  })

  it('checks source boundaries, order and repeated positions', () => {
    expect(matchesExpressionSource('credit-card-off', 'credit-card')).toBe(true)
    expect(matchesExpressionSource('credit-card-off', 'car')).toBe(false)
    expect(matchesExpressionSource('left-right-left-arrow', 'right-left')).toBe(true)
    expect(matchesExpressionSource('left-right-left-arrow', 'left-left')).toBe(false)
    expect(matchesExpressionSource('left-right-left-arrow', 'left-right-arrow')).toBe(false)
    expect(matchesExpressionSource('Account / User', 'User')).toBe(true)
  })

  it('keeps expressions out of original tokens and English vectors', () => {
    const document = deriveIconSearchDocument({
      id: 'test:search',
      prefix: 'test',
      name: 'search',
      collection: 'Test',
      source: 'builtin',
      palette: false,
      customIconId: null,
      primaryPhrases: ['search'],
      auxiliaryPhrases: ['test'],
      exactPhrases: ['search'],
      primaryExpressions: ['find', 'sign out', '打开 文件夹'],
      auxiliaryExpressions: ['账户'],
      exactExpressions: ['find'],
    })
    expect(document.fullTokens).toEqual(['search', 'test'])
    expect(document.primaryEnglishTerms).toEqual(['search'])
    expect(document.fullExpressions).toContain(expressionKey('打开文件夹'))
    expect(document.exactExpressions).toEqual([expressionKey('find')])
  })

  it('derives custom full Han keywords individually without joining separate keywords', () => {
    const document = deriveCustomIconSearchDocument({
      prefix: 'acme',
      name: 'folder',
      collection: 'Acme',
      palette: false,
      customIconId: '00000000-0000-0000-0000-000000000001',
      keywords: ['打开文件夹', '文件夹', '关闭', 'sign out'],
    })
    expect(document.fullExpressions).toContain(expressionKey('打开 文件夹'))
    expect(document.fullExpressions).not.toContain(expressionKey('文件夹关闭'))
    expect(document.fullExpressions).not.toContain(expressionKey('sign out'))
    expect(document.fullTokens).toEqual(expect.arrayContaining(['sign', 'out']))
  })
})
