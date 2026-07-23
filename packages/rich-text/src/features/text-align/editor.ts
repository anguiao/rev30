import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { textAlignOptions } from './alignments'
import { textAlignFeature } from './shared'

export const textAlignActions = [
  defineRichTextAction(textAlignFeature, {
    key: 'text-align-left',
    command:
      () =>
      ({ chain }) =>
        chain().focus().setTextAlign('left').run(),
    isActive: (editor) =>
      editor.isActive('paragraph', { textAlign: 'left' }) ||
      editor.isActive('heading', { textAlign: 'left' }),
  }),
  defineRichTextAction(textAlignFeature, {
    key: 'text-align-center',
    command:
      () =>
      ({ chain }) =>
        chain().focus().setTextAlign('center').run(),
    isActive: (editor) =>
      editor.isActive('paragraph', { textAlign: 'center' }) ||
      editor.isActive('heading', { textAlign: 'center' }),
  }),
  defineRichTextAction(textAlignFeature, {
    key: 'text-align-right',
    command:
      () =>
      ({ chain }) =>
        chain().focus().setTextAlign('right').run(),
    isActive: (editor) =>
      editor.isActive('paragraph', { textAlign: 'right' }) ||
      editor.isActive('heading', { textAlign: 'right' }),
  }),
  defineRichTextAction(textAlignFeature, {
    key: 'text-align-justify',
    command:
      () =>
      ({ chain }) =>
        chain().focus().setTextAlign('justify').run(),
    isActive: (editor) =>
      editor.isActive('paragraph', { textAlign: 'justify' }) ||
      editor.isActive('heading', { textAlign: 'justify' }),
  }),
] as const

export const textAlignActionItems = textAlignOptions.map((alignment, index) =>
  defineRichTextActionItem(textAlignActions[index]!, {
    label: alignment.label,
    icon: alignment.icon,
  }),
)

export const textAlignEditorFeature = defineRichTextEditorFeature(textAlignFeature, {})
