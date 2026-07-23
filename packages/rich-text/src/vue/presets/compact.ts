import { baseEditorFeature } from '../../features/base/editor'
import { boldActionItem, boldEditorFeature } from '../../features/bold/editor'
import { headingActionItems, headingEditorFeature } from '../../features/heading/editor'
import { historyActionItems, historyEditorFeature } from '../../features/history/editor'
import { italicActionItem, italicEditorFeature } from '../../features/italic/editor'
import { linkEditorFeature } from '../../features/link/editor'
import { linkQuickbar, linkQuickbarControl, linkToolbarControl } from '../../features/link/vue'
import { listActionItems, listEditorFeature } from '../../features/list/editor'
import { compactRichTextPreset } from '../../presets/compact'
import {
  defineRichTextToolbar,
  richTextToolbarButton as button,
  richTextToolbarDropdown as dropdown,
} from '../toolbar'
import { defineRichTextQuickbar, richTextQuickbarAction } from '../quickbar'
import { defineRichTextEditorPreset } from './types'

const compactEditorFeatures = [
  baseEditorFeature,
  historyEditorFeature,
  boldEditorFeature,
  italicEditorFeature,
  linkEditorFeature,
  headingEditorFeature,
  listEditorFeature,
] as const

const compactRichTextToolbar = defineRichTextToolbar([
  { key: 'history', controls: historyActionItems.map(button) },
  {
    key: 'marks',
    controls: [button(boldActionItem), button(italicActionItem), linkToolbarControl],
  },
  {
    key: 'blocks',
    controls: [
      dropdown({
        key: 'heading',
        label: '标题',
        icon: 'i-[lucide--heading]',
        items: headingActionItems,
      }),
      dropdown({
        key: 'list',
        label: '列表',
        icon: 'i-[lucide--list]',
        items: listActionItems,
      }),
    ],
  },
])

const compactRichTextQuickbar = defineRichTextQuickbar({
  text: {
    primary: [
      richTextQuickbarAction(boldActionItem),
      richTextQuickbarAction(italicActionItem),
      linkQuickbarControl,
    ],
    more: [],
  },
  features: [linkQuickbar],
})

export const compactRichTextEditorPreset = defineRichTextEditorPreset(compactRichTextPreset, {
  editorFeatures: compactEditorFeatures,
  toolbar: compactRichTextToolbar,
  quickbar: compactRichTextQuickbar,
})
