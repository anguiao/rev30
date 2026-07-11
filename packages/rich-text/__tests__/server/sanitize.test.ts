import { describe, expect, it } from 'vitest'
import type { RichTextHtmlPolicy } from '../../src/server/policy'
import { createRichTextHtmlSanitizer, sanitizeRichTextHtml } from '../../src/server/sanitize'

describe('sanitizeRichTextHtml', () => {
  it('compiles policies when creating a reusable sanitizer', () => {
    const policy = {
      allowedTags: ['p'],
    }
    const sanitize = createRichTextHtmlSanitizer([policy])

    policy.allowedTags?.push('strong')

    expect(sanitize('<p>正文</p><strong>强调</strong>')).toBe('<p>正文</p>强调')
    expect(sanitizeRichTextHtml('<p>正文</p><strong>强调</strong>', [policy])).toBe(
      '<p>正文</p><strong>强调</strong>',
    )
  })

  it('composes transforms targeting the same tag in policy order', () => {
    const trimLinkPolicy: RichTextHtmlPolicy = {
      allowedTags: ['a'],
      allowedAttributes: {
        a: ['href', 'target', 'rel'],
      },
      transformTags: {
        a: [
          ({ tagName, attribs }) => ({
            tagName,
            attribs: {
              ...attribs,
              href: (attribs.href ?? '').trim(),
            },
          }),
        ],
      },
    }

    const safeLinkPolicy: RichTextHtmlPolicy = {
      allowedTags: ['a'],
      allowedAttributes: {
        a: ['href', 'target', 'rel'],
      },
      transformTags: {
        a: [
          ({ tagName, attribs }) => ({
            tagName,
            attribs: {
              ...attribs,
              target: '_blank',
              rel: 'noopener noreferrer',
            },
          }),
        ],
      },
    }

    expect(
      sanitizeRichTextHtml('<a href=" https://example.com ">Example</a>', [
        trimLinkPolicy,
        safeLinkPolicy,
      ]),
    ).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">Example</a>')
  })
})
