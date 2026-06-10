import { defineRichTextCommand } from '../../vue/toolbar'
import { textAlignOptions } from './alignments'

export const textAlignCommands = textAlignOptions.map((alignment) =>
  defineRichTextCommand({
    key: `text-align-${alignment.key}`,
    label: alignment.label,
    icon: alignment.icon,
    run: (editor) => editor.chain().focus().setTextAlign(alignment.value).run(),
    isActive: (editor) =>
      editor.isActive('paragraph', { textAlign: alignment.value }) ||
      editor.isActive('heading', { textAlign: alignment.value }),
  }),
)
