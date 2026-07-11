import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { RICH_TEXT_DEMO_IMAGE_MAX_SIZE_BYTES } from '@rev30/contracts'
import { RichTextContentInvalidError } from '@rev30/rich-text/server'
import {
  deriveRichTextDemoContent,
  isAllowedRichTextDemoImageSrc,
} from '../../../../src/modules/demos/rich-text/content'

describe('rich text demo content', () => {
  it('derives all-preset content with an inline image', () => {
    const imageSrc = 'data:image/png;base64,aGVsbG8='
    const content = deriveRichTextDemoContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'underline' }], text: '组件演示' }],
        },
        {
          type: 'image',
          attrs: { src: imageSrc, alt: '示意图' },
        },
      ],
    })

    expect(content.text).toBe('组件演示')
    expect(content.html).toContain('<u>组件演示</u>')
    expect(content.html).toContain(`src="${imageSrc}"`)
  })

  it('accepts only canonical inline raster image data within the size limit', () => {
    const maximumPayload = Buffer.alloc(RICH_TEXT_DEMO_IMAGE_MAX_SIZE_BYTES).toString('base64')
    const oversizedPayload = Buffer.alloc(RICH_TEXT_DEMO_IMAGE_MAX_SIZE_BYTES + 1).toString(
      'base64',
    )

    expect(isAllowedRichTextDemoImageSrc('data:image/jpeg;base64,aGVsbG8=')).toBe(true)
    expect(isAllowedRichTextDemoImageSrc('data:image/png;base64,aGVsbG8=')).toBe(true)
    expect(isAllowedRichTextDemoImageSrc('data:image/webp;base64,aGVsbG8=')).toBe(true)
    expect(isAllowedRichTextDemoImageSrc(`data:image/png;base64,${maximumPayload}`)).toBe(true)
    expect(isAllowedRichTextDemoImageSrc(`data:image/png;base64,${oversizedPayload}`)).toBe(false)
    expect(isAllowedRichTextDemoImageSrc('data:image/svg+xml;base64,aGVsbG8=')).toBe(false)
    expect(isAllowedRichTextDemoImageSrc('https://example.com/image.png')).toBe(false)
  })

  it('rejects invalid image sources through the all server preset', () => {
    expect(() =>
      deriveRichTextDemoContent({
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'data:image/png;base64,not-base64!' } }],
      }),
    ).toThrow(RichTextContentInvalidError)
  })
})
