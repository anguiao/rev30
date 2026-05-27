import BulletList from '@tiptap/extension-bullet-list'
import ListItem from '@tiptap/extension-list-item'
import OrderedList from '@tiptap/extension-ordered-list'
import { defineRichTextFeature } from '../../core/feature'

export const listFeature = defineRichTextFeature({
  key: 'list',
  extension: () => [BulletList, OrderedList, ListItem],
})
