import { defineRichTextToolbarItem } from '../../core/toolbar'

export const historyToolbarItems = [
  defineRichTextToolbarItem({
    key: 'undo',
    label: '撤销',
    icon: 'i-[lucide--undo-2]',
    run: (editor) => editor.chain().focus().undo().run(),
  }),
  defineRichTextToolbarItem({
    key: 'redo',
    label: '重做',
    icon: 'i-[lucide--redo-2]',
    run: (editor) => editor.chain().focus().redo().run(),
  }),
]
