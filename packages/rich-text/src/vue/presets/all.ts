import { baseEditorFeature, paragraphActionItem } from '../../features/base/editor'
import { blockquoteActionItem, blockquoteEditorFeature } from '../../features/blockquote/editor'
import { boldActionItem, boldEditorFeature } from '../../features/bold/editor'
import { characterCountEditorFeature } from '../../features/character-count/editor'
import { characterCountStatusBarItem } from '../../features/character-count/vue'
import { codeBlockActionItem, codeBlockEditorFeature } from '../../features/code-block/editor'
import { codeBlockQuickbar, codeBlockToolbarControl } from '../../features/code-block/vue'
import { headingActionItems, headingEditorFeature } from '../../features/heading/editor'
import { highlightEditorFeature } from '../../features/highlight/editor'
import { highlightQuickbarControl, highlightToolbarControl } from '../../features/highlight/vue'
import { historyActionItems, historyEditorFeature } from '../../features/history/editor'
import {
  horizontalRuleActionItem,
  horizontalRuleEditorFeature,
} from '../../features/horizontal-rule/editor'
import { imageEditorFeature } from '../../features/image/editor'
import {
  createImageSlashCommand,
  createImageQuickbar,
  createImageToolbarControl,
  type RichTextImageUploadOptions,
} from '../../features/image/vue'
import ImageDialogHost from '../../features/image/vue/ImageDialogHost.vue'
import { inlineCodeActionItem, inlineCodeEditorFeature } from '../../features/inline-code/editor'
import { italicActionItem, italicEditorFeature } from '../../features/italic/editor'
import { linkEditorFeature } from '../../features/link/editor'
import { linkQuickbar, linkQuickbarControl, linkToolbarControl } from '../../features/link/vue'
import { listActionItems, listEditorFeature } from '../../features/list/editor'
import {
  removeFormatActionItem,
  removeFormatEditorFeature,
} from '../../features/remove-format/editor'
import { searchReplaceEditorFeature } from '../../features/search-replace/editor'
import { searchReplaceToolbarControl } from '../../features/search-replace/vue'
import { slashCommandEditorFeature } from '../../features/slash-command/editor'
import { strikeActionItem, strikeEditorFeature } from '../../features/strike/editor'
import { textAlignActionItems, textAlignEditorFeature } from '../../features/text-align/editor'
import { textStyleEditorFeature } from '../../features/text-style/editor'
import { textStyleToolbarControl } from '../../features/text-style/vue'
import { underlineActionItem, underlineEditorFeature } from '../../features/underline/editor'
import { allRichTextPreset } from '../../presets/all'
import { defineRichTextQuickbar, richTextQuickbarAction } from '../quickbar'
import { defineRichTextSlashCommand, richTextSlashCommandAction } from '../slash-command'
import RichTextSlashCommandMenu from '../slash-command/RichTextSlashCommandMenu.vue'
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
  slashCommandEditorFeature,
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
] as const

function createAllRichTextToolbar(options: AllRichTextEditorPresetOptions) {
  return defineRichTextToolbar([
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
      controls: [button(horizontalRuleActionItem), createImageToolbarControl(options.image)],
    },
  ])
}

function createAllRichTextQuickbar(options: AllRichTextEditorPresetOptions) {
  return defineRichTextQuickbar({
    text: {
      primary: [
        richTextQuickbarAction(boldActionItem),
        richTextQuickbarAction(italicActionItem),
        richTextQuickbarAction(underlineActionItem),
        highlightQuickbarControl,
        linkQuickbarControl,
      ],
      more: [
        richTextQuickbarAction(strikeActionItem),
        richTextQuickbarAction(inlineCodeActionItem),
        richTextQuickbarAction(removeFormatActionItem),
      ],
    },
    features: [createImageQuickbar(options.image), linkQuickbar, codeBlockQuickbar],
  })
}

function createAllRichTextSlashCommand(options: AllRichTextEditorPresetOptions) {
  return defineRichTextSlashCommand(
    [
      {
        key: 'basic',
        label: '基础块',
        commands: [
          richTextSlashCommandAction(paragraphActionItem),
          ...headingActionItems.map(richTextSlashCommandAction),
          richTextSlashCommandAction(blockquoteActionItem),
        ],
      },
      {
        key: 'list',
        label: '列表',
        commands: listActionItems.map(richTextSlashCommandAction),
      },
      {
        key: 'insert',
        label: '插入',
        commands: [
          richTextSlashCommandAction(codeBlockActionItem),
          richTextSlashCommandAction(horizontalRuleActionItem),
          createImageSlashCommand(options.image),
        ],
      },
    ],
    RichTextSlashCommandMenu,
  )
}

const allRichTextStatusBar = defineRichTextStatusBar({
  start: [],
  end: [characterCountStatusBarItem],
})

export function createAllRichTextEditorPreset(options: AllRichTextEditorPresetOptions) {
  return defineRichTextEditorPreset(allRichTextPreset, {
    editorFeatures: allEditorFeatures,
    toolbar: createAllRichTextToolbar(options),
    statusBar: allRichTextStatusBar,
    quickbar: createAllRichTextQuickbar(options),
    slashCommand: createAllRichTextSlashCommand(options),
    host: ImageDialogHost,
  })
}
