import { describe, expect, it } from 'vitest'
import { linkHtmlPolicy } from '../../../../src/features/link/server/feature'
import { sanitizeRichTextHtml } from '../../../../src/server/sanitize'

describe('link html policy', () => {
  it('keeps safe links and forces safe browsing attributes', () => {
    expect(
      sanitizeRichTextHtml('<a href="https://example.com" target="_self" rel="author">示例</a>', [
        linkHtmlPolicy,
      ]),
    ).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">示例</a>',
    )
  })

  it.each([
    ['example.com', 'https://example.com'],
    ['mailto:admin@example.com', 'mailto:admin@example.com'],
    ['tel:123', 'tel:123'],
  ])('normalizes and preserves supported href %s', (href, expected) => {
    expect(sanitizeRichTextHtml(`<a href="${href}">示例</a>`, [linkHtmlPolicy])).toBe(
      `<a href="${expected}" target="_blank" rel="noopener noreferrer nofollow">示例</a>`,
    )
  })

  it.each(['javascript:alert(1)', 'ftp://example.com', '/docs'])(
    'removes unsupported href %s while keeping safe browsing attributes',
    (href) => {
      expect(sanitizeRichTextHtml(`<a href="${href}">示例</a>`, [linkHtmlPolicy])).toBe(
        '<a target="_blank" rel="noopener noreferrer nofollow">示例</a>',
      )
    },
  )
})
