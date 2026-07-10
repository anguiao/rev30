import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { highlightColorOptions } from '../../../src/features/highlight/colors'
import { highlightFeature } from '../../../src/features/highlight/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor() {
  const extension = highlightFeature.extension()

  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      ...(Array.isArray(extension) ? extension : [extension]),
    ],
    content: '<p>维护通知</p>',
  })
}

describe('highlight feature', () => {
  it.each([...highlightColorOptions.map((option) => option.value), null])(
    'accepts a supported color: %s',
    (color) => {
      const editor = createEditor()

      expect(() =>
        editor.schema.markFromJSON({ type: 'highlight', attrs: { color } }),
      ).not.toThrow()
    },
  )

  it.each(['#000000', 'red; position: fixed', 1, {}])(
    'rejects an unsupported color: %s',
    (color) => {
      const editor = createEditor()

      expect(() => editor.schema.markFromJSON({ type: 'highlight', attrs: { color } })).toThrow()
    },
  )
})
