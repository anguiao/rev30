import { defineRichTextToolbarItem } from '../../core/toolbar'

export const listToolbarItems = [
  defineRichTextToolbarItem({
    key: 'bullet-list',
    label: '无序列表',
    icon: 'i-[lucide--list]',
    dataTest: 'rich-text-bullet-list',
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive('bulletList'),
  }),
  defineRichTextToolbarItem({
    key: 'ordered-list',
    label: '有序列表',
    icon: 'i-[lucide--list-ordered]',
    dataTest: 'rich-text-ordered-list',
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive('orderedList'),
  }),
]
