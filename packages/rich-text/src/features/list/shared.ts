import BulletList from '@tiptap/extension-bullet-list'
import ListItem from '@tiptap/extension-list-item'
import OrderedList from '@tiptap/extension-ordered-list'
import { defineRichTextFeature } from '../../core/feature'

export const listFeature = defineRichTextFeature({
  key: 'list',
  label: '列表',
  icon: 'i-[lucide--list]',
  extension: () => [BulletList, OrderedList, ListItem],
})
