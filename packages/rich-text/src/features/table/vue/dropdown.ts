import type { Editor } from '@tiptap/vue-3'
import { h } from 'vue'
import { canRunRichTextAction, type RichTextActionItem } from '../../../editor/action'
import {
  addColumnAfterActionItem,
  addColumnBeforeActionItem,
  addRowAfterActionItem,
  addRowBeforeActionItem,
  deleteColumnActionItem,
  deleteRowActionItem,
  deleteTableActionItem,
  mergeCellsActionItem,
  setCellAlignCenterActionItem,
  setCellAlignDefaultActionItem,
  setCellAlignLeftActionItem,
  setCellAlignRightActionItem,
  splitCellActionItem,
  toggleHeaderCellActionItem,
  toggleHeaderColumnActionItem,
  toggleHeaderRowActionItem,
} from '../editor'

export const tableRowActionItems = [
  addRowBeforeActionItem,
  addRowAfterActionItem,
  deleteRowActionItem,
] as const

export const tableColumnActionItems = [
  addColumnBeforeActionItem,
  addColumnAfterActionItem,
  deleteColumnActionItem,
] as const

export const tableCellActionItems = [
  mergeCellsActionItem,
  splitCellActionItem,
  toggleHeaderCellActionItem,
] as const

export const tableAlignmentActionItems = [
  setCellAlignDefaultActionItem,
  setCellAlignLeftActionItem,
  setCellAlignCenterActionItem,
  setCellAlignRightActionItem,
] as const

function isAlignmentActionItem(item: RichTextActionItem) {
  return tableAlignmentActionItems.some((candidate) => candidate.action === item.action)
}

function isHeaderToggleActionItem(item: RichTextActionItem) {
  return (
    item.action === toggleHeaderRowActionItem.action ||
    item.action === toggleHeaderColumnActionItem.action ||
    item.action === toggleHeaderCellActionItem.action
  )
}

function getTableDropdownItemLabel(item: RichTextActionItem, active: boolean) {
  if (item.action === toggleHeaderRowActionItem.action) {
    return active ? '取消首行表头' : '设置首行表头'
  }

  if (item.action === toggleHeaderColumnActionItem.action) {
    return active ? '取消首列表头' : '设置首列表头'
  }

  if (item.action === toggleHeaderCellActionItem.action) {
    return active ? '取消表头单元格' : '设置表头单元格'
  }

  return item.label
}

export function createTableDropdownOption(editor: Editor, item: RichTextActionItem) {
  const key = item.action.key
  const active = item.action.isActive?.(editor) ?? false
  const label = getTableDropdownItemLabel(item, active)
  const disabled = !canRunRichTextAction(editor, item.action)
  const destructive = item.action === deleteTableActionItem.action
  const role = isAlignmentActionItem(item)
    ? 'menuitemradio'
    : isHeaderToggleActionItem(item)
      ? 'menuitemcheckbox'
      : 'menuitem'
  const checked = role === 'menuitem' ? undefined : active

  return {
    action: item.action,
    key,
    label: destructive
      ? () => h('span', { class: 'text-(--rich-text-theme-error-color)' }, label)
      : label,
    disabled,
    icon: () =>
      h('span', {
        class: [
          item.icon,
          'inline-block size-4',
          destructive ? 'text-(--rich-text-theme-error-color)' : undefined,
          active ? 'text-(--rich-text-theme-primary-color)' : undefined,
        ],
        'aria-hidden': 'true',
      }),
    props: {
      'data-test': `rich-text-table-menu-${key}`,
      role,
      tabindex: -1,
      'aria-checked': checked,
      'aria-disabled': disabled ? true : undefined,
    },
  }
}

export type TableDropdownOption = ReturnType<typeof createTableDropdownOption>
