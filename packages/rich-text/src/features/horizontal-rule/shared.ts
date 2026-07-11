import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { defineRichTextFeature } from '../../core/feature'

export const horizontalRuleFeature = defineRichTextFeature({
  key: 'horizontal-rule',
  editorImplementation: true,
  serverImplementation: true,
  documentExtensions: () => [HorizontalRule],
})
