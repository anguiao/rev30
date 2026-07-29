import type { Editor } from '@tiptap/vue-3'
import { richTextFeatureQuickBar } from '../../../vue/quick-bar'
import { richTextToolbarComponent } from '../../../vue/toolbar'
import type { RichTextSlashCommand } from '../../../vue/slash-menu'
import { insertTableAction } from '../editor'
import { resolveRichTextTableContext, getRichTextTableWrapperElement } from '../editor'
import { TABLE_SLASH_INSERT_COLUMNS, TABLE_SLASH_INSERT_ROWS, tableFeature } from '../shared'
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

export const tableSlashCommand: RichTextSlashCommand = {
  feature: tableFeature,
  key: 'table',
  label: '表格',
  icon: 'i-[lucide--table-2]',
  keywords: ['table'],
  command: insertTableAction.command(TABLE_SLASH_INSERT_ROWS, TABLE_SLASH_INSERT_COLUMNS),
}

export { default as TableQuickBar } from './TableQuickBar.vue'
export { default as TableSizePicker } from './TableSizePicker.vue'
export { default as TableToolbarControl } from './TableToolbarControl.vue'
