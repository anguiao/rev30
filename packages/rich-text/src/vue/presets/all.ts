import '../../content/presets/all.css'
import { baseEditorFeature, paragraphActionItem } from '../../features/base/editor'
import { blockquoteActionItem, blockquoteEditorFeature } from '../../features/blockquote/editor'
import { boldActionItem, boldEditorFeature } from '../../features/bold/editor'
import { characterCountEditorFeature } from '../../features/character-count/editor'
import { characterCountStatusBarItem } from '../../features/character-count/vue'
import { codeBlockActionItem, codeBlockEditorFeature } from '../../features/code-block/editor'
import { codeBlockQuickBar, codeBlockToolbarControl } from '../../features/code-block/vue'
import { elementPathEditorFeature } from '../../features/element-path/editor'
import { elementPathStatusBarItem } from '../../features/element-path/vue'
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
import { inlineCodeActionItem, inlineCodeEditorFeature } from '../../features/inline-code/editor'
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
import { textStyleEditorFeature } from '../../features/text-style/editor'
import { textStyleToolbarControl } from '../../features/text-style/vue'
import { tableActionItem, tableEditorFeature } from '../../features/table/editor'
import { tableQuickBar, tableToolbarControl } from '../../features/table/vue'
import { underlineActionItem, underlineEditorFeature } from '../../features/underline/editor'
import { allRichTextPreset } from '../../core/presets/all'
import { defineRichTextQuickBar, richTextQuickBarAction } from '../quick-bar'
import { defineRichTextSlashMenu, richTextSlashCommand } from '../slash-menu'
import {
  defineRichTextToolbar,
  richTextToolbarButton as button,
  richTextToolbarDropdown as dropdown,
} from '../toolbar'
import { defineRichTextStatusBar } from '../status-bar'
import { defineRichTextEditorPreset } from './types'

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
