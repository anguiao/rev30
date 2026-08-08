import '../../../content/presets/all.css'
import { baseEditorFeature, paragraphActionItem } from '../../../features/base/client/editor'
import {
  blockquoteActionItem,
  blockquoteEditorFeature,
} from '../../../features/blockquote/client/editor'
import { boldActionItem, boldEditorFeature } from '../../../features/bold/client/editor'
import { characterCountEditorFeature } from '../../../features/character-count/client/editor'
import { characterCountStatusBarItem } from '../../../features/character-count/client/vue'
import {
  codeBlockActionItem,
  codeBlockEditorFeature,
} from '../../../features/code-block/client/editor'
import { codeBlockQuickBar, codeBlockToolbarControl } from '../../../features/code-block/client/vue'
import { elementPathEditorFeature } from '../../../features/element-path/client/editor'
import { elementPathStatusBarItem } from '../../../features/element-path/client/vue'
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
import {
  inlineCodeActionItem,
  inlineCodeEditorFeature,
} from '../../../features/inline-code/client/editor'
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
import { textStyleEditorFeature } from '../../../features/text-style/client/editor'
import { textStyleToolbarControl } from '../../../features/text-style/client/vue'
import { tableActionItem, tableEditorFeature } from '../../../features/table/client/editor'
import { tableQuickBar, tableToolbarControl } from '../../../features/table/client/vue'
import {
  underlineActionItem,
  underlineEditorFeature,
} from '../../../features/underline/client/editor'
import { allRichTextPreset } from '../../../core/presets/all'
import { defineRichTextQuickBar, richTextQuickBarAction } from '../quick-bar'
import { defineRichTextSlashMenu, richTextSlashCommand } from '../slash-menu'
import {
  defineRichTextToolbar,
  richTextToolbarButton as button,
  richTextToolbarDropdown as dropdown,
} from '../toolbar'
import { defineRichTextStatusBar } from '../status-bar'
import { defineRichTextEditorPreset } from '../preset'

export interface AllRichTextEditorPresetOptions {
  image: RichTextImageUploadOptions
}

const allEditorFeatures = [
  baseEditorFeature,
  historyEditorFeature,
  characterCountEditorFeature,
  searchReplaceEditorFeature,
  boldEditorFeature,
  italicEditorFeature,
  underlineEditorFeature,
  strikeEditorFeature,
  inlineCodeEditorFeature,
  highlightEditorFeature,
  textStyleEditorFeature,
  linkEditorFeature,
  removeFormatEditorFeature,
  headingEditorFeature,
  textAlignEditorFeature,
  blockquoteEditorFeature,
  codeBlockEditorFeature,
  listEditorFeature,
  horizontalRuleEditorFeature,
  imageEditorFeature,
  tableEditorFeature,
  elementPathEditorFeature,
] as const

const allRichTextToolbar = defineRichTextToolbar([
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
      button(inlineCodeActionItem),
      highlightToolbarControl,
      linkToolbarControl,
      button(removeFormatActionItem),
    ],
  },
  { key: 'text-style', controls: [textStyleToolbarControl] },
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
      codeBlockToolbarControl,
    ],
  },
  {
    key: 'insert',
    controls: [button(horizontalRuleActionItem), tableToolbarControl, imageToolbarControl],
  },
])

const allRichTextQuickBar = defineRichTextQuickBar({
  textControls: [
    richTextQuickBarAction(boldActionItem),
    richTextQuickBarAction(italicActionItem),
    richTextQuickBarAction(underlineActionItem),
    highlightQuickBarControl,
    linkQuickBarControl,
  ],
  featureBars: [imageQuickBar, linkQuickBar, codeBlockQuickBar, tableQuickBar],
})

const allRichTextSlashMenu = defineRichTextSlashMenu([
  {
    key: 'basic',
    label: '基础块',
    commands: [
      richTextSlashCommand(paragraphActionItem),
      ...headingActionItems.map((item) => richTextSlashCommand(item)),
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
      richTextSlashCommand(codeBlockActionItem),
      richTextSlashCommand(horizontalRuleActionItem),
      richTextSlashCommand(tableActionItem),
      richTextSlashCommand(imageActionItem),
    ],
  },
])

const allRichTextStatusBar = defineRichTextStatusBar({
  start: [elementPathStatusBarItem],
  end: [characterCountStatusBarItem],
})

export function createAllRichTextEditorPreset(options: AllRichTextEditorPresetOptions) {
  return defineRichTextEditorPreset(allRichTextPreset, {
    editorFeatures: allEditorFeatures,
    interactionHandlers: [createImagePickerHandler(options.image)],
    toolbar: allRichTextToolbar,
    statusBar: allRichTextStatusBar,
    quickBar: allRichTextQuickBar,
    slashMenu: allRichTextSlashMenu,
  })
}
