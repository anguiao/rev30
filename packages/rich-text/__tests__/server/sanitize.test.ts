import { describe, expect, it } from 'vitest'
import type { RichTextHtmlPolicy } from '../../src/server/policy'
import { sanitizeRichTextHtml } from '../../src/server/sanitize'

describe('sanitizeRichTextHtml', () => {
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
