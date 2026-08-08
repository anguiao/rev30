import { describe, expect, it } from 'vitest'
import { listHtmlPolicy } from '../../../../src/features/list/server/feature'
import { deriveRichTextContent } from '../../../../src/server'
import { compactRichTextServerPreset } from '../../../../src/server/presets/compact'
import { sanitizeRichTextHtml } from '../../../../src/server/sanitize'

describe('list html policy', () => {
  it('preserves ordered list numbering attributes in derived HTML', () => {
    const content = deriveRichTextContent(
      {
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            attrs: {
              start: 3,
              type: 'a',
            },
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Third item' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      compactRichTextServerPreset,
    )

    expect(content.json).toMatchObject({
      content: [
        {
          attrs: {
            start: 3,
            type: 'a',
          },
        },
      ],
    })
    expect(content.html).toBe('<ol start="3" type="a"><li><p>Third item</p></li></ol>')
  })

  it('removes invalid ordered list numbering attributes', () => {
    expect(
      sanitizeRichTextHtml(
        '<ol start="1.5" type="square"><li>Invalid</li></ol><ol start="-4" type="I"><li>Negative</li></ol><ol start="0"><li>Zero</li></ol>',
        [listHtmlPolicy],
      ),
    ).toBe(
      '<ol><li>Invalid</li></ol><ol start="-4" type="I"><li>Negative</li></ol><ol start="0"><li>Zero</li></ol>',
    )
  })
})
