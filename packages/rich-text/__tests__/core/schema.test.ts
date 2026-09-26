import { describe, expect, it } from 'vitest'
import { richTextDocumentEnvelopeSchema } from '../../src/core/schema'

describe('rich text schema helpers', () => {
  it('accepts doc-shaped Tiptap JSON', () => {
    const document = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
    }

    expect(richTextDocumentEnvelopeSchema.parse(document)).toEqual(document)
  })

  it('rejects non-doc roots', () => {
    expect(richTextDocumentEnvelopeSchema.safeParse({ type: 'paragraph' }).success).toBe(false)
  })
})
