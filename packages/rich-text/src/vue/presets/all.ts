import { baseEditorFeature } from '../../features/base/editor'
import { blockquoteEditorFeature } from '../../features/blockquote/editor'
import { blockquoteToolbarItem } from '../../features/blockquote/vue'
import { boldEditorFeature } from '../../features/bold/editor'
import { boldToolbarItem } from '../../features/bold/vue'
import { codeBlockEditorFeature } from '../../features/code-block/editor'
import { codeBlockToolbarControl } from '../../features/code-block/vue'
import { headingEditorFeature } from '../../features/heading/editor'
import { headingToolbarItems } from '../../features/heading/vue'
import { highlightEditorFeature } from '../../features/highlight/editor'
import { highlightToolbarControl } from '../../features/highlight/vue'
import { historyEditorFeature } from '../../features/history/editor'
import { historyToolbarItems } from '../../features/history/vue'
import { horizontalRuleEditorFeature } from '../../features/horizontal-rule/editor'
import { horizontalRuleToolbarItem } from '../../features/horizontal-rule/vue'
import { imageEditorFeature } from '../../features/image/editor'
import {
  createImageToolbarControl,
  type RichTextImageUploadOptions,
} from '../../features/image/vue'
import { inlineCodeEditorFeature } from '../../features/inline-code/editor'
import { inlineCodeToolbarItem } from '../../features/inline-code/vue'
import { italicEditorFeature } from '../../features/italic/editor'
import { italicToolbarItem } from '../../features/italic/vue'
import { linkEditorFeature } from '../../features/link/editor'
import { linkToolbarControl } from '../../features/link/vue'
import { listEditorFeature } from '../../features/list/editor'
import { listToolbarItems } from '../../features/list/vue'
import { removeFormatEditorFeature } from '../../features/remove-format/editor'
import { removeFormatToolbarItem } from '../../features/remove-format/vue'
import { strikeEditorFeature } from '../../features/strike/editor'
import { strikeToolbarItem } from '../../features/strike/vue'
import { tableEditorFeature } from '../../features/table/editor'
import { tableToolbarControl } from '../../features/table/vue'
import { textAlignEditorFeature } from '../../features/text-align/editor'
import { textAlignToolbarItems } from '../../features/text-align/vue'
import { textStyleEditorFeature } from '../../features/text-style/editor'
import { textStyleToolbarControl } from '../../features/text-style/vue'
import { underlineEditorFeature } from '../../features/underline/editor'
import { underlineToolbarItem } from '../../features/underline/vue'
import { allRichTextPreset } from '../../presets/all'
import {
  defineRichTextToolbar,
  richTextToolbarButton as button,
  richTextToolbarDropdown as dropdown,
} from '../toolbar'
import { defineRichTextEditorPreset } from './types'

export interface AllRichTextEditorPresetOptions {
  image: RichTextImageUploadOptions
}

const allEditorFeatures = [
  baseEditorFeature,
  historyEditorFeature,
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
  tableEditorFeature,
  horizontalRuleEditorFeature,
  imageEditorFeature,
] as const

function createAllRichTextToolbar(options: AllRichTextEditorPresetOptions) {
  return defineRichTextToolbar([
    { key: 'history', controls: historyToolbarItems.map(button) },
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
      controls: [
        button(horizontalRuleToolbarItem),
        tableToolbarControl,
        createImageToolbarControl(options.image),
      ],
    },
  ])
}

export function createAllRichTextEditorPreset(options: AllRichTextEditorPresetOptions) {
  return defineRichTextEditorPreset(allRichTextPreset, {
    editorFeatures: allEditorFeatures,
    toolbar: createAllRichTextToolbar(options),
  })
}
