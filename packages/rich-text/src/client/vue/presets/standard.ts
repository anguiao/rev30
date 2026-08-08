import '../../../content/presets/standard.css'
import { baseEditorFeature, paragraphActionItem } from '../../../features/base/client/editor'
import {
  blockquoteActionItem,
  blockquoteEditorFeature,
} from '../../../features/blockquote/client/editor'
import { boldActionItem, boldEditorFeature } from '../../../features/bold/client/editor'
import { characterCountEditorFeature } from '../../../features/character-count/client/editor'
import { characterCountStatusBarItem } from '../../../features/character-count/client/vue'
import { headingActionItems, headingEditorFeature } from '../../../features/heading/client/editor'
import { highlightEditorFeature } from '../../../features/highlight/client/editor'
import {
  highlightQuickBarControl,
  highlightToolbarControl,
} from '../../../features/highlight/client/vue'
import { historyActionItems, historyEditorFeature } from '../../../features/history/client/editor'
import {
  horizontalRuleActionItem,
  horizontalRuleEditorFeature,
} from '../../../features/horizontal-rule/client/editor'
import { imageActionItem, imageEditorFeature } from '../../../features/image/client/editor'
import {
  createImagePickerHandler,
  imageQuickBar,
  imageToolbarControl,
  type RichTextImageUploadOptions,
} from '../../../features/image/client/vue'
import { italicActionItem, italicEditorFeature } from '../../../features/italic/client/editor'
import { linkEditorFeature } from '../../../features/link/client/editor'
import {
  linkQuickBar,
  linkQuickBarControl,
  linkToolbarControl,
} from '../../../features/link/client/vue'
import { listActionItems, listEditorFeature } from '../../../features/list/client/editor'
import {
  removeFormatActionItem,
  removeFormatEditorFeature,
} from '../../../features/remove-format/client/editor'
import { searchReplaceEditorFeature } from '../../../features/search-replace/client/editor'
import { searchReplaceToolbarControl } from '../../../features/search-replace/client/vue'
import { strikeActionItem, strikeEditorFeature } from '../../../features/strike/client/editor'
import {
  textAlignActionItems,
  textAlignEditorFeature,
} from '../../../features/text-align/client/editor'
import {
  underlineActionItem,
  underlineEditorFeature,
} from '../../../features/underline/client/editor'
import { standardRichTextPreset } from '../../../core/presets/standard'
import { defineRichTextQuickBar, richTextQuickBarAction } from '../quick-bar'
import { defineRichTextSlashMenu, richTextSlashCommand } from '../slash-menu'
import { defineRichTextStatusBar } from '../status-bar'
import {
  defineRichTextToolbar,
  richTextToolbarButton as button,
  richTextToolbarDropdown as dropdown,
} from '../toolbar'
import { defineRichTextEditorPreset, type RichTextEditorPreset } from '../preset'

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
