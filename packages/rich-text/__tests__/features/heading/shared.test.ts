import Document from '@tiptap/extension-document'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { headingFeature } from '../../../src/features/heading/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor() {
  return createTestEditor({
    extensions: [Document, Text, ...headingFeature.documentExtensions!()],
    content: '<h1>维护通知</h1>',
  })
}

describe('heading feature', () => {
  it.each([1, 2, 3])('accepts the supported heading level: %s', (level) => {
    const editor = createEditor()

    expect(() =>
      editor.schema.nodeFromJSON({
        type: 'heading',
        attrs: { level },
        content: [{ type: 'text', text: '维护通知' }],
      }),
    ).not.toThrow()
  })

  it.each([0, 4, '2', 1.5])('rejects an unsupported heading level: %s', (level) => {
    const editor = createEditor()

    expect(() =>
      editor.schema.nodeFromJSON({
        type: 'heading',
        attrs: { level },
        content: [{ type: 'text', text: '维护通知' }],
      }),
    ).toThrow()
  })
})
