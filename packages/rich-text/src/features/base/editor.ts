import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import { Selection } from '@tiptap/extensions/selection'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { baseFeature } from './shared'

export const baseEditorFeature = defineRichTextEditorFeature(baseFeature, {
  extensions: () => [Dropcursor, Gapcursor, Selection],
})
