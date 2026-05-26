import { describe, expect, it } from 'vitest'
import { hasNonBlankRichText, richTextDocumentSchema } from '../src/schema'

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
      hasNonBlankRichText({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '  hello  ' }] }],
      }),
    ).toBe(true)
    expect(
      hasNonBlankRichText({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
      }),
    ).toBe(false)
    expect(hasNonBlankRichText(null)).toBe(false)
  })
})
