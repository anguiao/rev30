import type { Editor } from '@tiptap/vue-3'
import type { DropdownNodeProps, DropdownOption } from 'naive-ui'
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

export const tableActionItems = [
  ...tableRowActionItems,
  ...tableColumnActionItems,
  toggleHeaderRowActionItem,
  deleteTableActionItem,
] as const

function renderActionIcon(item: RichTextActionItem, active: boolean, destructive: boolean) {
  return () =>
    h('span', {
      class: [
        item.icon,
        'inline-block size-4',
        destructive
          ? 'text-(--rich-text-theme-error-color)'
          : active
            ? 'text-(--rich-text-theme-primary-color)'
            : undefined,
      ],
      'data-rich-text-table-destructive-icon': destructive ? 'true' : undefined,
      'aria-hidden': 'true',
    })
}

function renderMenuIcon(icon: string) {
  return () =>
    h('span', {
      class: [icon, 'inline-block size-4'],
      'aria-hidden': 'true',
    })
}

function renderActionLabel(
  label: string,
  active: boolean,
  isToggle: boolean,
  isDeleteTable: boolean,
) {
  if (isDeleteTable) {
    return () => h('span', { class: 'text-(--rich-text-theme-error-color)' }, label)
  }

  if (!isToggle) {
    return label
  }

  return () =>
    h('span', { class: 'inline-flex items-center gap-2' }, [
      label,
      active
        ? h('span', {
            class: 'i-[lucide--check] inline-block size-4 text-(--rich-text-theme-primary-color)',
            'data-rich-text-table-toggle-check': 'true',
            'aria-hidden': 'true',
          })
        : null,
    ])
}

function createTableDropdownOptionWithPresentation(
  editor: Editor,
  item: RichTextActionItem,
  label: string,
  showToggleState: boolean,
  disabled: boolean,
): DropdownOption {
  const active = showToggleState && (item.action.isActive?.(editor) ?? false)
  const itemDisabled = disabled || !canRunRichTextAction(editor, item.action)
  const isToggle = showToggleState && item.action.isActive !== undefined
  const isDeleteTable = item.action.key === deleteTableActionItem.action.key

  return {
    key: item.action.key,
    label: renderActionLabel(label, active, isToggle, isDeleteTable),
    disabled: itemDisabled,
    icon: renderActionIcon(item, active, isDeleteTable),
    props: {
      class: 'rich-text-table-option-body',
    },
    richTextTableAction: true,
    richTextTableActive: active,
    richTextTableToggle: isToggle,
  }
}

export function createTableDropdownOption(
  editor: Editor,
  item: RichTextActionItem,
  disabled = false,
) {
  return createTableDropdownOptionWithPresentation(editor, item, item.label, true, disabled)
}

export function createTableDropdownCommandOption(
  editor: Editor,
  item: RichTextActionItem,
  label: string,
  disabled = false,
) {
  return createTableDropdownOptionWithPresentation(editor, item, label, false, disabled)
}

export function createTableDropdownSubmenu(
  key: string,
  label: string,
  icon: string,
  children: DropdownOption[],
): DropdownOption {
  return {
    key,
    label,
    icon: renderMenuIcon(icon),
    children,
    props: {
      class: 'rich-text-table-option-body',
    },
    richTextTableSubmenu: true,
  }
}

export function createTableDropdownOptions(
  editor: Editor,
  items: readonly RichTextActionItem[],
  disabled = false,
) {
  return items.map((item) => createTableDropdownOption(editor, item, disabled))
}

export function findTableActionItem(items: readonly RichTextActionItem[], key: string | number) {
  return items.find((item) => item.action.key === key)
}

export const getTableDropdownNodeProps: DropdownNodeProps = (option) => {
  if (option.key === undefined) {
    return {}
  }

  if (option.richTextTableSubmenu === true) {
    return {
      'data-test': `rich-text-table-menu-${option.key}`,
      'data-rich-text-table-submenu': String(option.key),
      role: 'menuitem',
      tabindex: -1,
      'aria-haspopup': 'menu',
      ...(option.disabled ? { 'aria-disabled': true } : {}),
    }
  }

  if (option.richTextTableAction !== true) {
    return {}
  }

  const active = option.richTextTableActive === true
  const isToggle = option.richTextTableToggle === true

  return {
    'data-test': `rich-text-table-menu-${option.key}`,
    'data-rich-text-table-action': String(option.key),
    role: isToggle ? 'menuitemcheckbox' : 'menuitem',
    tabindex: -1,
    ...(active ? { 'data-active': 'true' } : {}),
    ...(isToggle ? { 'aria-checked': active } : {}),
    ...(option.disabled ? { 'aria-disabled': true } : {}),
  }
}
