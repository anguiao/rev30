import { describe, expect, it } from 'vitest'
import { baseHtmlPolicy } from '../../../src/features/base/server'
import { headingHtmlPolicy } from '../../../src/features/heading/server'
import { textAlignHtmlPolicy } from '../../../src/features/text-align/server'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'

const policies = [baseHtmlPolicy, headingHtmlPolicy, textAlignHtmlPolicy]
const paragraphColorPolicy = {
  allowedStyles: {
    p: {
      color: [/^red$/],
    },
  },
}

describe('text align html policy', () => {
  it('keeps supported text alignment on paragraphs and headings', () => {
    expect(
      sanitizeRichTextHtml(
        '<p style="text-align: center; color: red">居中</p><h2 style="text-align: right">右对齐</h2><p style="text-align: justify">两端对齐</p>',
        policies,
      ),
    ).toBe(
      '<p style="text-align:center">居中</p><h2 style="text-align:right">右对齐</h2><p style="text-align:justify">两端对齐</p>',
    )
  })

  it('removes unsupported text alignment styles', () => {
    expect(
      sanitizeRichTextHtml(
        '<p style="text-align: start">起始对齐</p><h1 style="position: fixed">标题</h1>',
        policies,
      ),
    ).toBe('<p>起始对齐</p><h1>标题</h1>')
  })

  it('preserves transformed styles when another policy allows styles on the same tag', () => {
    expect(
      sanitizeRichTextHtml('<p style="text-align: center">居中</p>', [
        ...policies,
        paragraphColorPolicy,
      ]),
    ).toBe('<p style="text-align:center">居中</p>')
  })
})
