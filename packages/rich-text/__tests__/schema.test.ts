import { describe, expect, it } from 'vitest'
import { hasRichTextContent, richTextDocumentSchema } from '../src/schema'

describe('rich text schema helpers', () => {
  it('accepts doc-shaped Tiptap JSON', () => {
    expect(
      richTextDocumentSchema.parse({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
      }),
    ).toMatchObject({ type: 'doc' })
  })

  it('rejects non-doc roots', () => {
    expect(richTextDocumentSchema.safeParse({ type: 'paragraph' }).success).toBe(false)
  })

  it('detects non-blank nested text', () => {
    expect(
      hasRichTextContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '  hello  ' }] }],
      }),
    ).toBe(true)
    expect(
      hasRichTextContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
      }),
    ).toBe(false)
    expect(hasRichTextContent(null)).toBe(false)
  })

  it('treats media nodes as rich text content', () => {
    expect(
      hasRichTextContent({
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: '/api/attachments/11111111-1111-4111-8111-111111111111/content',
              alt: '示意图',
            },
          },
        ],
      }),
    ).toBe(true)
  })

  it('does not treat decorative or unsupported nodes as rich text content', () => {
    expect(
      hasRichTextContent({
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { textAlign: 'center' } }],
      }),
    ).toBe(false)
    expect(
      hasRichTextContent({
        type: 'doc',
        content: [{ type: 'horizontalRule' }],
      }),
    ).toBe(false)
    expect(
      hasRichTextContent({
        type: 'doc',
        content: [{ type: 'unsupportedBlock' }],
      }),
    ).toBe(false)
  })
})
