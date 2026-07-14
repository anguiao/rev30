import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import {
  characterCountEditorFeature,
  countRichTextGraphemes,
} from '../../../src/features/character-count/editor'
import { createTestEditor } from '../../helpers/editor'

function createEditor(content: string = '<p>维护通知</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...characterCountEditorFeature.extensions!()],
    content,
  })
}

describe('character count editor feature', () => {
  it.each([
    ['维护通知', 4],
    ['ABC', 3],
    ['👨‍👩‍👧‍👦', 1],
    ['e\u0301', 1],
  ])('counts %s as %i graphemes', (text, count) => {
    expect(countRichTextGraphemes(text)).toBe(count)
  })

  it('provides the configured character count extension', () => {
    const extensions = characterCountEditorFeature.extensions!()

    expect(extensions.map((extension) => extension.name)).toEqual(['characterCount'])
    expect(extensions[0]?.options).toMatchObject({
      limit: null,
      mode: 'textSize',
      textCounter: countRichTextGraphemes,
    })
  })

  it('reads the current document from storage after content changes', () => {
    const editor = createEditor('<p>维护👨‍👩‍👧‍👦</p>')

    expect(editor.storage.characterCount.characters()).toBe(3)

    editor.commands.setContent('<p>ABC e\u0301</p>')

    expect(editor.storage.characterCount.characters()).toBe(5)
  })

  it('does not change the document JSON or HTML', () => {
    const editor = createEditor('<p>维护通知</p><p>ABC</p>')

    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '维护通知' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'ABC' }],
        },
      ],
    })
    expect(editor.getHTML()).toBe('<p>维护通知</p><p>ABC</p>')
  })
})
