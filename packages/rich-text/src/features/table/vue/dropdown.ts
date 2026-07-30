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

export function createTableDropdownOption(
  editor: Editor,
  item: RichTextActionItem,
  label = item.label,
) {
  const disabled = !canRunRichTextAction(editor, item.action)
  const destructive = item.action.key === deleteTableActionItem.action.key

  return {
    action: item.action,
    key: item.action.key,
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
        ],
        'aria-hidden': 'true',
      }),
    props: {
      'data-test': `rich-text-table-menu-${item.action.key}`,
      role: 'menuitem',
      tabindex: -1,
      'aria-disabled': disabled ? true : undefined,
    },
  }
}

export type TableActionDropdownOption = ReturnType<typeof createTableDropdownOption>
