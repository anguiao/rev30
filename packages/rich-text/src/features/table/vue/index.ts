import type { Editor } from '@tiptap/vue-3'
import { richTextFeatureQuickBar } from '../../../vue/quick-bar'
import { richTextToolbarComponent } from '../../../vue/toolbar'
import type { RichTextSlashCommand } from '../../../vue/slash-menu'
import { insertTableAction } from '../editor'
import { resolveRichTextTableContext, getRichTextTableWrapperElement } from '../editor'
import { tableFeature } from '../shared'
import TableQuickBar from './TableQuickBar.vue'
import TableToolbarControl from './TableToolbarControl.vue'

export const tableToolbarControl = richTextToolbarComponent({
  feature: tableFeature,
  component: TableToolbarControl,
  props: {},
})

export function isRichTextTableQuickBarActive(editor: Editor) {
  const context = resolveRichTextTableContext(editor.state.selection)
  return context !== null && context.selectionType !== 'text'
}

export const tableQuickBar = richTextFeatureQuickBar({
  feature: tableFeature,
  isActive: isRichTextTableQuickBarActive,
  component: TableQuickBar,
  props: {},
  getAnchorElement: (editor) => {
    const context = resolveRichTextTableContext(editor.state.selection)
    return context ? getRichTextTableWrapperElement(editor, context) : null
  },
  anchorAlignment: 'end',
})

const tableSlashCommandConfig: RichTextSlashCommand = {
  feature: tableFeature,
  key: 'table',
  label: '表格',
  icon: 'i-[lucide--table-2]',
  keywords: ['table'],
  command: insertTableAction.command(3, 3),
}

export const tableSlashCommand = tableSlashCommandConfig
export function createTableSlashCommand() {
  return tableSlashCommandConfig
}

export { default as TableQuickBar } from './TableQuickBar.vue'
export { default as TableSizePicker } from './TableSizePicker.vue'
export { default as TableToolbarControl } from './TableToolbarControl.vue'
