import { describe, expect, it } from 'vitest'
import { linkHtmlPolicy } from '../../../src/features/link/server'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'

function getAnchorAttributes(html: string) {
  const match = /^<a(?<attributes>(?:\s+[^>]+)?)>示例<\/a>$/.exec(html)

  expect(match).not.toBeNull()

  const attributesSource = match?.groups?.attributes ?? ''

  return Object.fromEntries(
    [...attributesSource.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
  )
}

function getAnchorAttributesByText(html: string, text: string) {
  const match = new RegExp(`<a(?<attributes>(?:\\s+[^>]+)?)>${text}<\\/a>`).exec(html)

  expect(match).not.toBeNull()

  const attributesSource = match?.groups?.attributes ?? ''

  return Object.fromEntries(
    [...attributesSource.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
  )
}

describe('link html policy', () => {
  it('keeps safe links and forces safe browsing attributes', () => {
    const sanitized = sanitizeRichTextHtml(
      '<a href="https://example.com" target="_self" rel="author">示例</a>',
      [linkHtmlPolicy],
    )

    const attributes = getAnchorAttributes(sanitized)

    expect(attributes.href).toBe('https://example.com')
    expect(attributes.target).toBe('_blank')
    expect(attributes.rel).toBe('noopener noreferrer nofollow')
  })

  it.each([
    ['example.com', 'https://example.com'],
    ['example.com:8080/docs', 'https://example.com:8080/docs'],
  ])('normalizes href values without explicit protocol: %s', (href, expectedHref) => {
    const sanitized = sanitizeRichTextHtml(`<a href="${href}">示例</a>`, [linkHtmlPolicy])

    const attributes = getAnchorAttributes(sanitized)

    expect(attributes.href).toBe(expectedHref)
  })

  it.each(['/docs', '#details'])('keeps same-site href values: %s', (href) => {
    const sanitized = sanitizeRichTextHtml(`<a href="${href}">示例</a>`, [linkHtmlPolicy])

    const attributes = getAnchorAttributes(sanitized)

    expect(attributes.href).toBe(href)
  })

  it('removes dangerous href values while keeping forced safe attributes', () => {
    const sanitized = sanitizeRichTextHtml('<a href="javascript:alert(1)">示例</a>', [
      linkHtmlPolicy,
    ])

    const attributes = getAnchorAttributes(sanitized)

    expect(attributes.href).toBeUndefined()
    expect(attributes.target).toBe('_blank')
    expect(attributes.rel).toBe('noopener noreferrer nofollow')
    expect(sanitized).not.toContain('javascript:')
  })

  it('removes unsupported absolute schemes', () => {
    const sanitized = sanitizeRichTextHtml('<a href="ftp://example.com">示例</a>', [linkHtmlPolicy])

    const attributes = getAnchorAttributes(sanitized)

    expect(attributes.href).toBeUndefined()
    expect(sanitized).not.toContain('ftp:')
  })

  it.each(['//example.com', '/\\example.com'])(
    'removes protocol-relative href values: %s',
    (href) => {
      const sanitized = sanitizeRichTextHtml(`<a href="${href}">示例</a>`, [linkHtmlPolicy])

      const attributes = getAnchorAttributes(sanitized)

      expect(attributes.href).toBeUndefined()
      expect(sanitized).not.toContain(href)
    },
  )

  it('allows mail and telephone links', () => {
    const sanitized = sanitizeRichTextHtml(
      '<a href="mailto:admin@example.com">邮箱</a><a href="tel:123">电话</a>',
      [linkHtmlPolicy],
    )

    expect(getAnchorAttributesByText(sanitized, '邮箱')).toEqual({
      href: 'mailto:admin@example.com',
      rel: 'noopener noreferrer nofollow',
      target: '_blank',
    })
    expect(getAnchorAttributesByText(sanitized, '电话')).toEqual({
      href: 'tel:123',
      rel: 'noopener noreferrer nofollow',
      target: '_blank',
    })
  })
})
