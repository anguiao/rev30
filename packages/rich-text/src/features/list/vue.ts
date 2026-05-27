import { defineRichTextCommand } from '../../core/toolbar'

export const listCommands = [
  defineRichTextCommand({
    key: 'bullet-list',
    label: '无序列表',
    icon: 'i-[lucide--list]',
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive('bulletList'),
  }),
  defineRichTextCommand({
    key: 'ordered-list',
    label: '有序列表',
    icon: 'i-[lucide--list-ordered]',
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive('orderedList'),
  }),
]
