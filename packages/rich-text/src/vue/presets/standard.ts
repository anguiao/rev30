import '../../content/presets/standard.css'
import { baseEditorFeature, paragraphActionItem } from '../../features/base/editor'
import { blockquoteActionItem, blockquoteEditorFeature } from '../../features/blockquote/editor'
import { boldActionItem, boldEditorFeature } from '../../features/bold/editor'
import { characterCountEditorFeature } from '../../features/character-count/editor'
import { characterCountStatusBarItem } from '../../features/character-count/vue'
import { headingActionItems, headingEditorFeature } from '../../features/heading/editor'
import { highlightEditorFeature } from '../../features/highlight/editor'
import { highlightQuickBarControl, highlightToolbarControl } from '../../features/highlight/vue'
import { historyActionItems, historyEditorFeature } from '../../features/history/editor'
import {
  horizontalRuleActionItem,
  horizontalRuleEditorFeature,
} from '../../features/horizontal-rule/editor'
import { imageActionItem, imageEditorFeature } from '../../features/image/editor'
import {
  createImagePickerHandler,
  imageQuickBar,
  imageToolbarControl,
  type RichTextImageUploadOptions,
} from '../../features/image/vue'
import { italicActionItem, italicEditorFeature } from '../../features/italic/editor'
import { linkEditorFeature } from '../../features/link/editor'
import { linkQuickBar, linkQuickBarControl, linkToolbarControl } from '../../features/link/vue'
import { listActionItems, listEditorFeature } from '../../features/list/editor'
import {
  removeFormatActionItem,
  removeFormatEditorFeature,
} from '../../features/remove-format/editor'
import { searchReplaceEditorFeature } from '../../features/search-replace/editor'
import { searchReplaceToolbarControl } from '../../features/search-replace/vue'
import { strikeActionItem, strikeEditorFeature } from '../../features/strike/editor'
import { textAlignActionItems, textAlignEditorFeature } from '../../features/text-align/editor'
import { underlineActionItem, underlineEditorFeature } from '../../features/underline/editor'
import { standardRichTextPreset } from '../../presets/standard'
import { defineRichTextQuickBar, richTextQuickBarAction } from '../quick-bar'
import { defineRichTextSlashMenu, richTextSlashCommand } from '../slash-menu'
import { defineRichTextStatusBar } from '../status-bar'
import {
  defineRichTextToolbar,
  richTextToolbarButton as button,
  richTextToolbarDropdown as dropdown,
} from '../toolbar'
import { defineRichTextEditorPreset, type RichTextEditorPreset } from './types'

export interface StandardRichTextEditorPresetOptions {
  image: RichTextImageUploadOptions
}

const standardEditorFeatures = [
  baseEditorFeature,
  historyEditorFeature,
  characterCountEditorFeature,
  searchReplaceEditorFeature,
  boldEditorFeature,
  italicEditorFeature,
  underlineEditorFeature,
  strikeEditorFeature,
  highlightEditorFeature,
  linkEditorFeature,
  removeFormatEditorFeature,
  headingEditorFeature,
  textAlignEditorFeature,
  blockquoteEditorFeature,
  listEditorFeature,
  horizontalRuleEditorFeature,
  imageEditorFeature,
] as const

const standardRichTextToolbar = defineRichTextToolbar([
  {
    key: 'history',
    controls: [...historyActionItems.map(button), searchReplaceToolbarControl],
  },
  {
    key: 'marks',
    controls: [
      button(boldActionItem),
      button(italicActionItem),
      button(underlineActionItem),
      button(strikeActionItem),
      highlightToolbarControl,
      linkToolbarControl,
      button(removeFormatActionItem),
    ],
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
        key: 'text-align',
        label: '对齐',
        icon: 'i-[lucide--align-left]',
        items: textAlignActionItems,
      }),
      dropdown({
        key: 'list',
        label: '列表',
        icon: 'i-[lucide--list]',
        items: listActionItems,
      }),
      button(blockquoteActionItem),
    ],
  },
  {
    key: 'insert',
    controls: [button(horizontalRuleActionItem), imageToolbarControl],
  },
])

const standardRichTextQuickBar = defineRichTextQuickBar({
  textControls: [
    richTextQuickBarAction(boldActionItem),
    richTextQuickBarAction(italicActionItem),
    richTextQuickBarAction(underlineActionItem),
    highlightQuickBarControl,
    linkQuickBarControl,
  ],
  featureBars: [imageQuickBar, linkQuickBar],
})

const standardRichTextSlashMenu = defineRichTextSlashMenu([
  {
    key: 'basic',
    label: '基础块',
    commands: [
      richTextSlashCommand(paragraphActionItem),
      richTextSlashCommand(headingActionItems[2]),
      richTextSlashCommand(blockquoteActionItem),
    ],
  },
  {
    key: 'list',
    label: '列表',
    commands: listActionItems.map((item) => richTextSlashCommand(item)),
  },
  {
    key: 'insert',
    label: '插入',
    commands: [
      richTextSlashCommand(horizontalRuleActionItem),
      richTextSlashCommand(imageActionItem),
    ],
  },
])

const standardRichTextStatusBar = defineRichTextStatusBar({
  start: [],
  end: [characterCountStatusBarItem],
})

export function createStandardRichTextEditorPreset(
  options: StandardRichTextEditorPresetOptions,
): RichTextEditorPreset {
  return defineRichTextEditorPreset(standardRichTextPreset, {
    editorFeatures: standardEditorFeatures,
    interactionHandlers: [createImagePickerHandler(options.image)],
    toolbar: standardRichTextToolbar,
    statusBar: standardRichTextStatusBar,
    quickBar: standardRichTextQuickBar,
    slashMenu: standardRichTextSlashMenu,
  })
}
