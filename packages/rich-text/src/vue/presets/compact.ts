import {
  defineRichTextToolbar,
  richTextToolbarButton as button,
  richTextToolbarDropdown as dropdown,
} from '../../core/toolbar'
import { blockquoteCommand } from '../../features/blockquote/vue'
import { boldCommand } from '../../features/bold/vue'
import { headingCommands } from '../../features/heading/vue'
import { historyCommands } from '../../features/history/vue'
import { horizontalRuleCommand } from '../../features/horizontal-rule/vue'
import { italicCommand } from '../../features/italic/vue'
import { listCommands } from '../../features/list/vue'
import { underlineCommand } from '../../features/underline/vue'
import { compactRichTextPreset } from '../../presets'
import { defineRichTextEditorPreset } from './types'

export const compactRichTextToolbar = defineRichTextToolbar([
  { key: 'history', controls: historyCommands.map(button) },
  {
    key: 'marks',
    controls: [button(boldCommand), button(italicCommand), button(underlineCommand)],
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
  { key: 'insert', controls: [button(horizontalRuleCommand)] },
])

export const compactRichTextEditorPreset = defineRichTextEditorPreset({
  preset: compactRichTextPreset,
  toolbar: compactRichTextToolbar,
})
