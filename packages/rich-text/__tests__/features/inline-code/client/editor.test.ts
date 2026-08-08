import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { canRunRichTextAction, runRichTextAction } from '../../../../src/client/editor/action'
import { inlineCodeAction } from '../../../../src/features/inline-code/client/editor'
import { inlineCodeFeature } from '../../../../src/features/inline-code/core/feature'
import { inlineCodeActionItem } from '../../../../src/features/inline-code/client/editor'
import { createTestEditor } from '../../../helpers/editor'

function createEditor() {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...inlineCodeFeature.sharedExtensions!()],
    content: '<p>pnpm check</p>',
  })
}

function selectText(editor: ReturnType<typeof createEditor>) {
  editor.commands.setTextSelection({
    from: 1,
    to: editor.state.doc.nodeSize - 3,
  })
}

describe('inline code feature', () => {
  it('toggles inline code and exposes its action state', () => {
    const editor = createEditor()
    selectText(editor)

    expect(canRunRichTextAction(editor, inlineCodeAction)).toBe(true)
    expect(runRichTextAction(editor, inlineCodeAction)).toBe(true)
    expect(inlineCodeAction.isActive?.(editor)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'pnpm check',
              marks: [{ type: 'code' }],
            },
          ],
        },
      ],
    })
    expect(editor.getHTML()).toBe('<p><code>pnpm check</code></p>')
  })

  it('keeps the native Mod-e shortcut', () => {
    const editor = createEditor()
    selectText(editor)

    expect(editor.commands.keyboardShortcut('Mod-e')).toBe(true)
    expect(editor.isActive('code')).toBe(true)
  })

  it('provides the Chinese action item', () => {
    expect(inlineCodeActionItem).toMatchObject({
      action: inlineCodeAction,
      label: '行内代码',
      icon: 'i-[lucide--code]',
    })
  })
})
