import { defineRichTextCommand } from '../../core/toolbar'

export const historyCommands = [
  defineRichTextCommand({
    key: 'undo',
    label: '撤销',
    icon: 'i-[lucide--undo-2]',
    run: (editor) => editor.chain().focus().undo().run(),
  }),
  defineRichTextCommand({
    key: 'redo',
    label: '重做',
    icon: 'i-[lucide--redo-2]',
    run: (editor) => editor.chain().focus().redo().run(),
  }),
]
