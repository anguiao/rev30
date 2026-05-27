import { defineRichTextCommand } from '../../core/toolbar'

export const headingCommands = [
  defineRichTextCommand({
    key: 'heading-1',
    label: '一级标题',
    icon: 'i-[lucide--heading-1]',
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
  }),
  defineRichTextCommand({
    key: 'heading-2',
    label: '二级标题',
    icon: 'i-[lucide--heading-2]',
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
  }),
  defineRichTextCommand({
    key: 'heading-3',
    label: '三级标题',
    icon: 'i-[lucide--heading-3]',
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
  }),
]
