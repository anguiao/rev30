import { describe, expect, it } from 'vitest'
import { richTextDocumentEnvelopeSchema } from '../src/schema'

describe('rich text schema helpers', () => {
  it('accepts doc-shaped Tiptap JSON', () => {
    expect(
      richTextDocumentEnvelopeSchema.parse({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
      }),
    ).toMatchObject({ type: 'doc' })
  })

  it('rejects non-doc roots', () => {
    expect(richTextDocumentEnvelopeSchema.safeParse({ type: 'paragraph' }).success).toBe(false)
  })
})
