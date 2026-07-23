import Document from '@tiptap/extension-document'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { runRichTextAction } from '../../../src/editor/action'
import { textAlignActions } from '../../../src/features/text-align/editor'
import { textAlignFeature } from '../../../src/features/text-align/shared'
import { textAlignActionItems } from '../../../src/features/text-align/editor'
import { createTestEditor } from '../../helpers/editor'

function createEditor() {
  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Heading.configure({ levels: [1, 2, 3] }),
      Text,
      ...textAlignFeature.documentExtensions!(),
    ],
    content: '<p>维护通知</p>',
  })
}

describe('text align editor feature', () => {
  it('exposes and runs the justify action from its Vue action item', () => {
    const editor = createEditor()
    const justifyAction = textAlignActions[3]
    const justifyActionItem = textAlignActionItems[3]

    expect(justifyAction.key).toBe('text-align-justify')
    expect(justifyActionItem).toMatchObject({
      action: justifyAction,
      label: '两端对齐',
      icon: 'i-[lucide--align-justify]',
    })

    expect(runRichTextAction(editor, justifyAction)).toBe(true)
    expect(justifyAction.isActive?.(editor)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [{ type: 'paragraph', attrs: { textAlign: 'justify' } }],
    })
    expect(editor.getHTML()).toBe('<p style="text-align: justify;">维护通知</p>')
  })
})
