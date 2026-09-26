import { describe, expect, it } from 'vitest'
import { type RichTextHtmlPolicy, sanitizeRichTextHtml } from '../../src/server/sanitize'

describe('sanitizeRichTextHtml', () => {
  it('composes transforms targeting the same tag in policy order', () => {
    const normalizeLinkPolicy: RichTextHtmlPolicy = {
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
              href: `https://${(attribs.href ?? '').trim()}`,
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
              href: (attribs.href ?? '').replace('https://example.com', 'https://docs.example.com'),
              target: '_blank',
              rel: 'noopener noreferrer',
            },
          }),
        ],
      },
    }

    expect(
      sanitizeRichTextHtml('<a href=" example.com ">Example</a>', [
        normalizeLinkPolicy,
        safeLinkPolicy,
      ]),
    ).toBe(
      '<a href="https://docs.example.com" target="_blank" rel="noopener noreferrer">Example</a>',
    )
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
