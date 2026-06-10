import {
  defineRichTextToolbar,
  richTextToolbarButton as button,
  richTextToolbarDropdown as dropdown,
} from '../toolbar'
import { blockquoteCommand } from '../../features/blockquote/vue'
import { boldCommand } from '../../features/bold/vue'
import { headingCommands } from '../../features/heading/vue'
import { historyCommands } from '../../features/history/vue'
import { highlightToolbarControl } from '../../features/highlight/vue'
import { horizontalRuleCommand } from '../../features/horizontal-rule/vue'
import {
  createImageToolbarControl,
  type RichTextImageUploadOptions,
} from '../../features/image/vue'
import { italicCommand } from '../../features/italic/vue'
import { linkToolbarControl } from '../../features/link/vue'
import { listCommands } from '../../features/list/vue'
import { strikeCommand } from '../../features/strike/vue'
import { underlineCommand } from '../../features/underline/vue'
import { compactRichTextPreset } from '../../presets'
import { defineRichTextEditorPreset, type RichTextEditorPreset } from './types'

export interface CompactRichTextEditorPresetOptions {
  image: RichTextImageUploadOptions
}

function createCompactRichTextToolbar(options: CompactRichTextEditorPresetOptions) {
  return defineRichTextToolbar([
    { key: 'history', controls: historyCommands.map(button) },
    {
      key: 'marks',
      controls: [
        button(boldCommand),
        button(italicCommand),
        button(underlineCommand),
        button(strikeCommand),
        highlightToolbarControl,
        linkToolbarControl,
      ],
    },
    {
      key: 'blocks',
      controls: [
        dropdown({
          key: 'heading',
          label: '标题',
          icon: 'i-[lucide--heading]',
          commands: headingCommands,
        }),
        dropdown({
          key: 'list',
          label: '列表',
          icon: 'i-[lucide--list]',
          commands: listCommands,
        }),
        button(blockquoteCommand),
      ],
    },
    {
      key: 'insert',
      controls: [button(horizontalRuleCommand), createImageToolbarControl(options.image)],
    },
  ])
}

export function createCompactRichTextEditorPreset(
  options: CompactRichTextEditorPresetOptions,
): RichTextEditorPreset {
  return defineRichTextEditorPreset({
    ...compactRichTextPreset,
    toolbar: createCompactRichTextToolbar(options),
  })
}
