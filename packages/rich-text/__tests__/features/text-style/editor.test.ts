import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { canRunRichTextAction, runRichTextAction } from '../../../src/editor/action'
import {
  setFontFamilyAction,
  setFontSizeAction,
  setLineHeightAction,
  setTextColorAction,
  unsetFontFamilyAction,
  unsetFontSizeAction,
  unsetLineHeightAction,
  unsetTextColorAction,
} from '../../../src/features/text-style/editor'
import { textStyleFeature } from '../../../src/features/text-style/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor() {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...textStyleFeature.documentExtensions!()],
    content: '<p>维护通知</p>',
  })
}

function selectText(editor: ReturnType<typeof createEditor>) {
  editor.commands.setTextSelection({
    from: 1,
    to: editor.state.doc.nodeSize - 3,
  })
}

describe('text style editor feature', () => {
  it('combines and removes the four styles on one span', () => {
    const editor = createEditor()
    selectText(editor)

    expect(canRunRichTextAction(editor, setTextColorAction, '#ef4444')).toBe(true)
    expect(runRichTextAction(editor, setTextColorAction, '#ef4444')).toBe(true)
    expect(runRichTextAction(editor, setFontFamilyAction, 'serif')).toBe(true)
    expect(runRichTextAction(editor, setFontSizeAction, '14pt')).toBe(true)
    expect(runRichTextAction(editor, setLineHeightAction, '1.5')).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              marks: [
                {
                  type: 'textStyle',
                  attrs: {
                    color: '#ef4444',
                    fontFamily: 'serif',
                    fontSize: '14pt',
                    lineHeight: '1.5',
                  },
                },
              ],
            },
          ],
        },
      ],
    })
    expect(editor.getHTML()).toBe(
      '<p><span style="color: #ef4444; font-family: serif; font-size: 14pt; line-height: 1.5;">维护通知</span></p>',
    )

    expect(canRunRichTextAction(editor, unsetTextColorAction)).toBe(true)
    expect(runRichTextAction(editor, unsetTextColorAction)).toBe(true)
    expect(runRichTextAction(editor, unsetFontFamilyAction)).toBe(true)
    expect(runRichTextAction(editor, unsetFontSizeAction)).toBe(true)
    expect(runRichTextAction(editor, unsetLineHeightAction)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
    })
    expect(editor.getHTML()).toBe('<p>维护通知</p>')
  })
})
