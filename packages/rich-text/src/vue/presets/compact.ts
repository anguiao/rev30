import { baseEditorFeature, paragraphActionItem } from '../../features/base/editor'
import { boldActionItem, boldEditorFeature } from '../../features/bold/editor'
import { headingActionItems, headingEditorFeature } from '../../features/heading/editor'
import { historyActionItems, historyEditorFeature } from '../../features/history/editor'
import { italicActionItem, italicEditorFeature } from '../../features/italic/editor'
import { linkEditorFeature } from '../../features/link/editor'
import { linkQuickBar, linkQuickBarControl, linkToolbarControl } from '../../features/link/vue'
import { listActionItems, listEditorFeature } from '../../features/list/editor'
import { compactRichTextPreset } from '../../presets/compact'
import { defineRichTextQuickBar, richTextQuickBarAction } from '../quick-bar'
import { defineRichTextSlashMenu, richTextSlashCommand } from '../slash-menu'
import {
  defineRichTextToolbar,
  richTextToolbarButton as button,
  richTextToolbarDropdown as dropdown,
} from '../toolbar'
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

const compactRichTextQuickBar = defineRichTextQuickBar({
  textControls: {
    main: [
      richTextQuickBarAction(boldActionItem),
      richTextQuickBarAction(italicActionItem),
      linkQuickBarControl,
    ],
    more: [],
  },
  featureBars: [linkQuickBar],
})

const compactRichTextSlashMenu = defineRichTextSlashMenu([
  {
    key: 'basic',
    label: '基础块',
    commands: [
      richTextSlashCommand(paragraphActionItem),
      ...headingActionItems.map((item) => richTextSlashCommand(item)),
    ],
  },
  {
    key: 'list',
    label: '列表',
    commands: listActionItems.map((item) => richTextSlashCommand(item)),
  },
])

export const compactRichTextEditorPreset = defineRichTextEditorPreset(compactRichTextPreset, {
  editorFeatures: compactEditorFeatures,
  toolbar: compactRichTextToolbar,
  quickBar: compactRichTextQuickBar,
  slashMenu: compactRichTextSlashMenu,
})
