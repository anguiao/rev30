import { baseEditorFeature } from '../../features/base/editor'
import { boldEditorFeature } from '../../features/bold/editor'
import { boldToolbarItem } from '../../features/bold/vue'
import { headingEditorFeature } from '../../features/heading/editor'
import { headingToolbarItems } from '../../features/heading/vue'
import { historyEditorFeature } from '../../features/history/editor'
import { historyToolbarItems } from '../../features/history/vue'
import { italicEditorFeature } from '../../features/italic/editor'
import { italicToolbarItem } from '../../features/italic/vue'
import { linkEditorFeature } from '../../features/link/editor'
import { linkQuickbar, linkQuickbarControl, linkToolbarControl } from '../../features/link/vue'
import { listEditorFeature } from '../../features/list/editor'
import { listToolbarItems } from '../../features/list/vue'
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
  { key: 'history', controls: historyToolbarItems.map(button) },
  {
    key: 'marks',
    controls: [button(boldToolbarItem), button(italicToolbarItem), linkToolbarControl],
  },
  {
    key: 'blocks',
    controls: [
      dropdown({
        key: 'heading',
        label: '标题',
        icon: 'i-[lucide--heading]',
        items: headingToolbarItems,
      }),
      dropdown({
        key: 'list',
        label: '列表',
        icon: 'i-[lucide--list]',
        items: listToolbarItems,
      }),
    ],
  },
])

const compactRichTextQuickbar = defineRichTextQuickbar({
  text: {
    primary: [
      richTextQuickbarAction(boldToolbarItem),
      richTextQuickbarAction(italicToolbarItem),
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
