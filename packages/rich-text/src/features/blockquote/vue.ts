import { defineRichTextToolbarItem } from '../../core/toolbar'
import { blockquoteFeature } from './shared'

export const blockquoteToolbarItem = defineRichTextToolbarItem({
  key: blockquoteFeature.key,
  label: blockquoteFeature.label,
  icon: blockquoteFeature.icon!,
  dataTest: 'rich-text-blockquote',
  run: (editor) => editor.chain().focus().toggleBlockquote().run(),
})
