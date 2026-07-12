import { describe, expect, it } from 'vitest'
import { normalizeLinkHref } from '../../../src/features/link/href'

describe('normalizeLinkHref', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['http://example.com', 'http://example.com'],
    ['example.com', 'https://example.com'],
    [' mailto:admin@example.com ', 'mailto:admin@example.com'],
    ['tel:123', 'tel:123'],
  ])('normalizes a supported href: %s', (href, expected) => {
    expect(normalizeLinkHref(href)).toBe(expected)
  })

  it.each([
    'javascript:alert(1)',
    'ftp://example.com',
    '/docs',
    './docs',
    '../docs',
    '#details',
    '?page=1',
    '//example.com',
    '/\\example.com',
    'example.com:8080/docs',
  ])('rejects an unsupported href: %s', (href) => {
    expect(normalizeLinkHref(href)).toBe('')
  })
})
