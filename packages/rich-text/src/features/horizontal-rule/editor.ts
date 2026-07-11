import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { horizontalRuleFeature } from './shared'

export const horizontalRuleAction = defineRichTextAction(horizontalRuleFeature, {
  key: horizontalRuleFeature.key,
  run: (editor) => editor.chain().focus().setHorizontalRule().run(),
})

export const horizontalRuleEditorFeature = defineRichTextEditorFeature(horizontalRuleFeature, {
  actions: [horizontalRuleAction],
})
