import { describe, expect, it } from 'vitest'
import { createImageHtmlPolicy } from '../../../src/features/image/server'
import { RichTextContentInvalidError } from '../../../src/server/errors'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'

const attachmentSrc = '/api/attachments/11111111-1111-4111-8111-111111111111/content'
const imagePolicy = createImageHtmlPolicy({
  isAllowedSrc: (src) => src === attachmentSrc,
})

function getImageAttributes(html: string) {
  const match = /^<img(?<attributes>(?:\s+[^>]+)?) \/>$/.exec(html)
  expect(match).not.toBeNull()

  const attributesSource = match?.groups?.attributes ?? ''

  const attributes = Object.fromEntries(
    [...attributesSource.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
  )

  if (typeof attributes.style === 'string') {
    attributes.style = attributes.style
      .split(';')
      .map((part: string) => part.trim())
      .filter(Boolean)
      .map((part: string) => {
        const [name = '', value = ''] = part.split(':')
        return `${name.trim()}: ${value.trim()}`
      })
      .join('; ')
  }

  return attributes
}

describe('image html policy', () => {
  it('keeps authenticated attachment images and rebuilds safe style', () => {
    const sanitized = sanitizeRichTextHtml(
      `<img src="${attachmentSrc}" alt="示意图" width="640" height="360" style="position: fixed; inset: 0">`,
      [imagePolicy],
    )

    expect(getImageAttributes(sanitized)).toEqual({
      src: attachmentSrc,
      alt: '示意图',
      width: '640',
      height: '360',
      style: 'width: 640px; max-width: 100%; height: auto',
    })
  })

  it('preserves an explicitly empty alt and omits only an absent alt', () => {
    const decorative = sanitizeRichTextHtml(`<img src="${attachmentSrc}" alt="" />`, [imagePolicy])
    const unspecified = sanitizeRichTextHtml(`<img src="${attachmentSrc}" />`, [imagePolicy])

    expect(getImageAttributes(decorative)).toMatchObject({ alt: '' })
    expect(getImageAttributes(unspecified)).not.toHaveProperty('alt')
  })

  it('rejects non-internal image sources', () => {
    expect(() =>
      sanitizeRichTextHtml('<img src="https://example.com/image.png" alt="外部图片" />', [
        imagePolicy,
      ]),
    ).toThrow(RichTextContentInvalidError)

    expect(() =>
      sanitizeRichTextHtml('<img src="data:image/png;base64,abc" alt="base64" />', [imagePolicy]),
    ).toThrow(RichTextContentInvalidError)

    expect(() =>
      sanitizeRichTextHtml('<img src="//example.com/image.png" alt="协议相对" />', [imagePolicy]),
    ).toThrow(RichTextContentInvalidError)
  })

  it('allows configured data images without enabling data links', () => {
    const dataSrc = 'data:image/png;base64,aGVsbG8='
    const dataImagePolicy = createImageHtmlPolicy({
      allowedSrcSchemes: ['data'],
      isAllowedSrc: (src) => src === dataSrc,
    })

    expect(
      sanitizeRichTextHtml(`<img src="${dataSrc}" alt="base64" />`, [dataImagePolicy]),
    ).toContain(`src="${dataSrc}"`)
  })

  it('rejects internal image sources with surrounding whitespace', () => {
    expect(() =>
      sanitizeRichTextHtml(`<img src=" ${attachmentSrc} " alt="示意图" />`, [imagePolicy]),
    ).toThrow(RichTextContentInvalidError)
  })

  it('drops invalid dimensions and keeps overflow protection', () => {
    const sanitized = sanitizeRichTextHtml(
      `<img src="${attachmentSrc}" alt="示意图" width="0" height="-1" style="width: 9999px">`,
      [imagePolicy],
    )

    expect(getImageAttributes(sanitized)).toEqual({
      src: attachmentSrc,
      alt: '示意图',
      style: 'max-width: 100%; height: auto',
    })
  })

  it.each([
    `<img src="${attachmentSrc}" alt="示意图" height="360" style="height: 360px">`,
    `<img src="${attachmentSrc}" alt="示意图" width="0" height="360" style="width: 0px; height: 360px">`,
  ])('drops height when width is missing or invalid: %s', (html) => {
    const sanitized = sanitizeRichTextHtml(html, [imagePolicy])

    expect(getImageAttributes(sanitized)).toEqual({
      src: attachmentSrc,
      alt: '示意图',
      style: 'max-width: 100%; height: auto',
    })
  })
})
