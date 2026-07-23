import { describe, expect, it } from 'vitest'
import { type RichTextHtmlPolicy, sanitizeRichTextHtml } from '../../src/server/sanitize'

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

  it('scopes additional URL schemes to the configured tag', () => {
    const policy: RichTextHtmlPolicy = {
      allowedTags: ['a', 'img'],
      allowedAttributes: {
        a: ['href'],
        img: ['src'],
      },
      allowedSchemesByTag: {
        img: ['data'],
      },
    }
    const dataUrl = 'data:image/png;base64,aGVsbG8='

    expect(
      sanitizeRichTextHtml(
        `<img src="${dataUrl}" /><a href="data:text/html;base64,aGVsbG8=">Link</a>`,
        [policy],
      ),
    ).toBe(`<img src="${dataUrl}" /><a>Link</a>`)
  })
})
