import { getSchema } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { highlightColorOptions } from '../../../../src/features/highlight/core/colors'
import { highlightFeature } from '../../../../src/features/highlight/core/feature'
import { createTestEditor } from '../../../helpers/editor'

const schema = getSchema([Document, Paragraph, Text, ...highlightFeature.sharedExtensions!()])

describe('highlight feature', () => {
  it('canonicalizes external highlight colors and preserves an unsupported mark without color', () => {
    const supportedColor = highlightColorOptions[0]!.value
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...highlightFeature.sharedExtensions!()],
      content: `<p><mark data-color=" ${supportedColor.toUpperCase()} ">支持</mark><mark data-color="#000000" style="background-color: ${supportedColor}">未知</mark></p>`,
    })

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              text: '支持',
              marks: [{ type: 'highlight', attrs: { color: supportedColor } }],
            },
            {
              text: '未知',
              marks: [{ type: 'highlight', attrs: { color: null } }],
            },
          ],
        },
      ],
    })
    expect(() => editor.state.doc.check()).not.toThrow()
  })

  it.each([...highlightColorOptions.map((option) => option.value), null])(
    'accepts a supported color: %s',
    (color) => {
      expect(() => schema.markFromJSON({ type: 'highlight', attrs: { color } })).not.toThrow()
    },
  )

  it.each(['#000000', 'red; position: fixed', 1, {}])(
    'rejects an unsupported color: %s',
    (color) => {
      expect(() => schema.markFromJSON({ type: 'highlight', attrs: { color } })).toThrow()
    },
  )
})
