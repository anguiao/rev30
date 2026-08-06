import type { Editor } from '@tiptap/vue-3'
import { h } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../../editor/action'
import {
  addColumnAfterActionItem,
  addColumnBeforeActionItem,
  addRowAfterActionItem,
  addRowBeforeActionItem,
  cellAlignActionItems,
  deleteColumnActionItem,
  deleteRowActionItem,
  deleteTableActionItem,
  mergeCellsActionItem,
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

export const tableAlignmentActionItems = cellAlignActionItems

export type TableDropdownActionItem =
  | (typeof tableRowActionItems)[number]
  | (typeof tableColumnActionItems)[number]
  | (typeof tableCellActionItems)[number]
  | (typeof tableAlignmentActionItems)[number]
  | typeof toggleHeaderRowActionItem
  | typeof toggleHeaderColumnActionItem
  | typeof deleteTableActionItem

function isAlignmentActionItem(
  item: TableDropdownActionItem,
): item is (typeof tableAlignmentActionItems)[number] {
  return 'alignment' in item
}

function isHeaderToggleActionItem(item: TableDropdownActionItem) {
  return (
    item.action === toggleHeaderRowActionItem.action ||
    item.action === toggleHeaderColumnActionItem.action ||
    item.action === toggleHeaderCellActionItem.action
  )
}

function getTableDropdownItemKey(item: TableDropdownActionItem) {
  if (!isAlignmentActionItem(item)) {
    return item.action.key
  }

  return `${item.action.key}-${item.alignment ?? 'default'}`
}

function getTableDropdownItemLabel(editor: Editor, item: TableDropdownActionItem) {
  const active = getTableDropdownItemActive(editor, item)

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

function getTableDropdownItemActive(editor: Editor, item: TableDropdownActionItem) {
  if (isAlignmentActionItem(item)) {
    return item.action.isActive?.(editor, item.alignment) ?? false
  }

  return item.action.isActive?.(editor) ?? false
}

function canRunTableDropdownItem(editor: Editor, item: TableDropdownActionItem) {
  if (isAlignmentActionItem(item)) {
    return canRunRichTextAction(editor, item.action, item.alignment)
  }

  return canRunRichTextAction(editor, item.action)
}

export function createTableDropdownOption(editor: Editor, item: TableDropdownActionItem) {
  const key = getTableDropdownItemKey(item)
  const active = getTableDropdownItemActive(editor, item)
  const label = getTableDropdownItemLabel(editor, item)
  const disabled = !canRunTableDropdownItem(editor, item)
  const destructive = item.action.key === deleteTableActionItem.action.key
  const role = isAlignmentActionItem(item)
    ? 'menuitemradio'
    : isHeaderToggleActionItem(item)
      ? 'menuitemcheckbox'
      : 'menuitem'
  const checked = role === 'menuitem' ? undefined : active

  return {
    item,
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

export type TableActionDropdownOption = ReturnType<typeof createTableDropdownOption>

export function runTableDropdownOption(editor: Editor, option: TableActionDropdownOption) {
  if (isAlignmentActionItem(option.item)) {
    return runRichTextAction(editor, option.item.action, option.item.alignment)
  }

  return runRichTextAction(editor, option.item.action)
}
