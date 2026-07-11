import { baseEditorFeature } from '../../features/base/editor'
import { blockquoteEditorFeature } from '../../features/blockquote/editor'
import { blockquoteToolbarItem } from '../../features/blockquote/vue'
import { boldEditorFeature } from '../../features/bold/editor'
import { boldToolbarItem } from '../../features/bold/vue'
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
import { textAlignEditorFeature } from '../../features/text-align/editor'
import { textAlignToolbarItems } from '../../features/text-align/vue'
import { underlineEditorFeature } from '../../features/underline/editor'
import { underlineToolbarItem } from '../../features/underline/vue'
import { compactRichTextPreset } from '../../presets'
import {
  defineRichTextToolbar,
  richTextToolbarButton as button,
  richTextToolbarDropdown as dropdown,
} from '../toolbar'
import { defineRichTextEditorPreset, type RichTextEditorPreset } from './types'

export interface CompactRichTextEditorPresetOptions {
  image: RichTextImageUploadOptions
}

const compactEditorFeatures = [
  baseEditorFeature,
  historyEditorFeature,
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

function createCompactRichTextToolbar(options: CompactRichTextEditorPresetOptions) {
  return defineRichTextToolbar([
    { key: 'history', controls: historyToolbarItems.map(button) },
    {
      key: 'marks',
      controls: [
        button(boldToolbarItem),
        button(italicToolbarItem),
        button(underlineToolbarItem),
        button(strikeToolbarItem),
        highlightToolbarControl,
        linkToolbarControl,
        button(removeFormatToolbarItem),
      ],
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
      ],
    },
    {
      key: 'insert',
      controls: [button(horizontalRuleToolbarItem), createImageToolbarControl(options.image)],
    },
  ])
}

export function createCompactRichTextEditorPreset(
  options: CompactRichTextEditorPresetOptions,
): RichTextEditorPreset {
  return defineRichTextEditorPreset(compactRichTextPreset, {
    editorFeatures: compactEditorFeatures,
    toolbar: createCompactRichTextToolbar(options),
  })
}
