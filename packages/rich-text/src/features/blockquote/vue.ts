import { defineRichTextCommand } from '../../core/toolbar'
import { blockquoteFeature } from './shared'

export const blockquoteCommand = defineRichTextCommand({
  key: blockquoteFeature.key,
  label: '引用',
  icon: 'i-[lucide--quote]',
  run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  isActive: (editor) => editor.isActive('blockquote'),
})
