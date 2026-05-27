import { defineRichTextToolbarLayout } from '../../core/toolbar'
import { blockquoteToolbarItem } from '../../features/blockquote/vue'
import { boldToolbarItem } from '../../features/bold/vue'
import { headingToolbarItems } from '../../features/heading/vue'
import { historyToolbarItems } from '../../features/history/vue'
import { horizontalRuleToolbarItem } from '../../features/horizontal-rule/vue'
import { italicToolbarItem } from '../../features/italic/vue'
import { listToolbarItems } from '../../features/list/vue'
import { underlineToolbarItem } from '../../features/underline/vue'
import { compactRichTextPreset } from '../../presets'
import { defineRichTextEditorPreset } from '../preset'

export const compactRichTextToolbarLayout = defineRichTextToolbarLayout([
  { key: 'history', items: ['undo', 'redo'] },
  { key: 'marks', items: ['bold', 'italic', 'underline'] },
  { key: 'blocks', items: ['heading-1', 'heading-2', 'heading-3', 'blockquote'] },
  { key: 'lists', items: ['bullet-list', 'ordered-list'] },
  { key: 'insert', items: ['horizontal-rule'] },
])

export const compactRichTextToolbarItems = [
  ...historyToolbarItems,
  boldToolbarItem,
  italicToolbarItem,
  underlineToolbarItem,
  ...headingToolbarItems,
  blockquoteToolbarItem,
  ...listToolbarItems,
  horizontalRuleToolbarItem,
]

export const compactRichTextEditorPreset = defineRichTextEditorPreset({
  preset: compactRichTextPreset,
  toolbarLayout: compactRichTextToolbarLayout,
  toolbarItems: compactRichTextToolbarItems,
})
