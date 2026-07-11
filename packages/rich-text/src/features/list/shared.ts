import BulletList from '@tiptap/extension-bullet-list'
import ListItem from '@tiptap/extension-list-item'
import OrderedList from '@tiptap/extension-ordered-list'
import { defineRichTextFeature } from '../../core/feature'
import { baseFeature } from '../base/shared'

export const listFeature = defineRichTextFeature({
  key: 'list',
  editorImplementation: true,
  serverImplementation: true,
  dependencies: [baseFeature],
  documentExtensions: () => [BulletList, OrderedList, ListItem],
})
