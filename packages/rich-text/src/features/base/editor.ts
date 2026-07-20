import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import { Selection } from '@tiptap/extensions/selection'
import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { baseFeature } from './shared'

export const paragraphAction = defineRichTextAction(baseFeature, {
  key: 'paragraph',
  command:
    () =>
    ({ chain, state }) =>
      state.selection.$from.parent.type.name === 'paragraph'
        ? chain().focus().run()
        : chain().focus().setParagraph().run(),
  isActive: (editor) => editor.isActive('paragraph'),
})

export const baseEditorFeature = defineRichTextEditorFeature(baseFeature, {
  extensions: () => [Dropcursor, Gapcursor, Selection],
})
