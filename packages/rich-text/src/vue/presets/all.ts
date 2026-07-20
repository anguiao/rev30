import { baseEditorFeature } from '../../features/base/editor'
import { paragraphActionItem } from '../../features/base/vue'
import { blockCommandEditorFeature } from '../../features/block-command/editor'
import { blockquoteEditorFeature } from '../../features/blockquote/editor'
import { blockquoteToolbarItem } from '../../features/blockquote/vue'
import { boldEditorFeature } from '../../features/bold/editor'
import { boldToolbarItem } from '../../features/bold/vue'
import { characterCountEditorFeature } from '../../features/character-count/editor'
import { characterCountStatusBarItem } from '../../features/character-count/vue'
import { codeBlockEditorFeature } from '../../features/code-block/editor'
import {
  codeBlockActionItem,
  codeBlockQuickbar,
  codeBlockToolbarControl,
} from '../../features/code-block/vue'
import { headingEditorFeature } from '../../features/heading/editor'
import { headingToolbarItems } from '../../features/heading/vue'
import { highlightEditorFeature } from '../../features/highlight/editor'
import { highlightQuickbarControl, highlightToolbarControl } from '../../features/highlight/vue'
import { historyEditorFeature } from '../../features/history/editor'
import { historyToolbarItems } from '../../features/history/vue'
import { horizontalRuleEditorFeature } from '../../features/horizontal-rule/editor'
import { horizontalRuleToolbarItem } from '../../features/horizontal-rule/vue'
import { imageEditorFeature } from '../../features/image/editor'
import {
  createImageBlockMenuCommand,
  createImageQuickbar,
  createImageToolbarControl,
  type RichTextImageUploadOptions,
} from '../../features/image/vue'
import { inlineCodeEditorFeature } from '../../features/inline-code/editor'
import { inlineCodeToolbarItem } from '../../features/inline-code/vue'
import { italicEditorFeature } from '../../features/italic/editor'
import { italicToolbarItem } from '../../features/italic/vue'
import { linkEditorFeature } from '../../features/link/editor'
import { linkQuickbar, linkQuickbarControl, linkToolbarControl } from '../../features/link/vue'
import { listEditorFeature } from '../../features/list/editor'
import { listToolbarItems } from '../../features/list/vue'
import { removeFormatEditorFeature } from '../../features/remove-format/editor'
import { removeFormatToolbarItem } from '../../features/remove-format/vue'
import { searchReplaceEditorFeature } from '../../features/search-replace/editor'
import { searchReplaceToolbarControl } from '../../features/search-replace/vue'
import { strikeEditorFeature } from '../../features/strike/editor'
import { strikeToolbarItem } from '../../features/strike/vue'
import { textAlignEditorFeature } from '../../features/text-align/editor'
import { textAlignToolbarItems } from '../../features/text-align/vue'
import { textStyleEditorFeature } from '../../features/text-style/editor'
import { textStyleToolbarControl } from '../../features/text-style/vue'
import { underlineEditorFeature } from '../../features/underline/editor'
import { underlineToolbarItem } from '../../features/underline/vue'
import { allRichTextPreset } from '../../presets/all'
import RichTextBlockMenu from '../block-menu/RichTextBlockMenu.vue'
import { defineRichTextBlockMenu, richTextBlockMenuAction } from '../block-menu'
import { defineRichTextQuickbar, richTextQuickbarAction } from '../quickbar'
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
  blockCommandEditorFeature,
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
      controls: [...historyToolbarItems.map(button), searchReplaceToolbarControl],
    },
    {
      key: 'marks',
      controls: [
        button(boldToolbarItem),
        button(italicToolbarItem),
        button(underlineToolbarItem),
        button(strikeToolbarItem),
        button(inlineCodeToolbarItem),
        highlightToolbarControl,
        linkToolbarControl,
        button(removeFormatToolbarItem),
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
          items: headingToolbarItems,
        }),
        dropdown({
          key: 'text-align',
          label: '对齐',
          icon: 'i-[lucide--align-left]',
          items: textAlignToolbarItems,
        }),
        dropdown({
          key: 'list',
          label: '列表',
          icon: 'i-[lucide--list]',
          items: listToolbarItems,
        }),
        button(blockquoteToolbarItem),
        codeBlockToolbarControl,
      ],
    },
    {
      key: 'insert',
      controls: [button(horizontalRuleToolbarItem), createImageToolbarControl(options.image)],
    },
  ])
}

function createAllRichTextQuickbar(options: AllRichTextEditorPresetOptions) {
  return defineRichTextQuickbar({
    text: {
      primary: [
        richTextQuickbarAction(boldToolbarItem),
        richTextQuickbarAction(italicToolbarItem),
        richTextQuickbarAction(underlineToolbarItem),
        highlightQuickbarControl,
        linkQuickbarControl,
      ],
      more: [
        richTextQuickbarAction(strikeToolbarItem),
        richTextQuickbarAction(inlineCodeToolbarItem),
        richTextQuickbarAction(removeFormatToolbarItem),
      ],
    },
    features: [createImageQuickbar(options.image), linkQuickbar, codeBlockQuickbar],
  })
}

function createAllRichTextBlockMenu(options: AllRichTextEditorPresetOptions) {
  return defineRichTextBlockMenu(
    [
      {
        key: 'basic',
        label: '基础块',
        commands: [
          richTextBlockMenuAction(paragraphActionItem, ['段落', 'paragraph', 'text']),
          richTextBlockMenuAction(headingToolbarItems[0], ['标题1', 'h1', 'heading1']),
          richTextBlockMenuAction(headingToolbarItems[1], ['标题2', 'h2', 'heading2']),
          richTextBlockMenuAction(headingToolbarItems[2], ['标题3', 'h3', 'heading3']),
          richTextBlockMenuAction(blockquoteToolbarItem, ['quote', 'blockquote']),
        ],
      },
      {
        key: 'list',
        label: '列表',
        commands: [
          richTextBlockMenuAction(listToolbarItems[0], ['项目符号', 'bullet', 'unordered', 'ul']),
          richTextBlockMenuAction(listToolbarItems[1], ['编号列表', 'numbered', 'ordered', 'ol']),
        ],
      },
      {
        key: 'insert',
        label: '插入',
        commands: [
          richTextBlockMenuAction(codeBlockActionItem, ['代码', 'code', 'codeblock']),
          richTextBlockMenuAction(horizontalRuleToolbarItem, [
            '横线',
            'divider',
            'separator',
            'horizontalrule',
            'hr',
          ]),
          createImageBlockMenuCommand(options.image),
        ],
      },
    ],
    RichTextBlockMenu,
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
    blockMenu: createAllRichTextBlockMenu(options),
  })
}
