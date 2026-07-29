<script setup lang="ts">
import type { DropdownDividerOption, DropdownOption } from 'naive-ui'
import { NButton, NDropdown, NPopover } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../../editor/action'
import { focusRichTextMenuItem, handleRichTextMenuKeydown } from '../../../vue/interactions/focus'
import type { RichTextToolbarControlProps } from '../../../vue/toolbar'
import {
  deleteTableAction,
  deleteTableActionItem,
  insertTableAction,
  resolveRichTextTableContext,
  toggleHeaderRowActionItem,
} from '../editor'
import TableSizePicker from './TableSizePicker.vue'
import {
  createTableDropdownCommandOption,
  createTableDropdownOption,
  createTableDropdownOptions,
  createTableDropdownSubmenu,
  findTableActionItem,
  getTableDropdownNodeProps,
  tableActionItems,
  tableColumnActionItems,
  tableRowActionItems,
} from './dropdown'

type TableStructureDropdownOption = DropdownOption | DropdownDividerOption

const props = withDefaults(defineProps<RichTextToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const sizePicker = ref<InstanceType<typeof TableSizePicker> | null>(null)
const showSizePicker = ref(false)
const showStructureMenu = ref(false)
const version = ref(0)
let closeStructureOnFocusout = false
let structureSelectSucceeded: boolean | null = null
let structureFocusTimer: ReturnType<typeof setTimeout> | undefined
let submenuFocusTimer: ReturnType<typeof setTimeout> | undefined
let pendingStructureFocus: 'active' | 'last' | undefined

const context = computed(() => {
  void version.value
  return resolveRichTextTableContext(editor.state.selection)
})

const isActive = computed(() => context.value !== null)
const isDisabled = computed(() => {
  void version.value

  if (props.disabled) {
    return true
  }

  return context.value
    ? !canRunRichTextAction(editor, deleteTableAction)
    : !canRunRichTextAction(editor, insertTableAction, 1, 1)
})
const buttonLabel = computed(() => (isActive.value ? '表格操作' : '表格'))
const structureOptions = computed<TableStructureDropdownOption[]>(() => {
  void version.value
  const headerActive = toggleHeaderRowActionItem.action.isActive?.(editor) ?? false

  return [
    createTableDropdownSubmenu(
      'table-row-actions',
      '行',
      'i-[lucide--rows-3]',
      createTableDropdownOptions(editor, tableRowActionItems),
    ),
    createTableDropdownSubmenu(
      'table-column-actions',
      '列',
      'i-[lucide--columns-3]',
      createTableDropdownOptions(editor, tableColumnActionItems),
    ),
    {
      type: 'divider',
      key: 'table-level-divider',
    },
    createTableDropdownCommandOption(
      editor,
      toggleHeaderRowActionItem,
      headerActive ? '取消首行表头' : '设置首行表头',
    ),
    createTableDropdownOption(editor, deleteTableActionItem),
  ]
})

function sync() {
  version.value += 1
}

function getTrigger() {
  return root.value?.querySelector<HTMLElement>('[data-rich-text-toolbar-item="table"]') ?? null
}

function closePopup() {
  clearTimeout(structureFocusTimer)
  clearTimeout(submenuFocusTimer)
  structureFocusTimer = undefined
  submenuFocusTimer = undefined
  pendingStructureFocus = undefined
  closeStructureOnFocusout = false
  structureSelectSucceeded = null
  showSizePicker.value = false
  showStructureMenu.value = false
}

function restoreTrigger() {
  getTrigger()?.focus()
  closePopup()
}

function focusStructureMenu(entry: 'active' | 'last') {
  clearTimeout(structureFocusTimer)
  pendingStructureFocus = entry
  void nextTick(() => {
    if (!showStructureMenu.value || pendingStructureFocus !== entry) {
      return
    }

    structureFocusTimer = setTimeout(() => {
      if (showStructureMenu.value && pendingStructureFocus === entry) {
        focusRichTextMenuItem(root.value, entry)
      }
    })
  })
}

function getSubmenuParent(menu: HTMLElement | null) {
  return menu?.parentElement?.closest<HTMLElement>('[data-rich-text-table-submenu]') ?? null
}

function focusStructureSubmenu(item: HTMLElement) {
  const optionBody = item.querySelector<HTMLElement>('.rich-text-table-option-body')
  optionBody?.dispatchEvent(new MouseEvent('mouseenter'))

  clearTimeout(submenuFocusTimer)
  void nextTick(() => {
    submenuFocusTimer = setTimeout(() => {
      if (!showStructureMenu.value || !item.isConnected) {
        return
      }

      const submenu = item.querySelector<HTMLElement>('[role="menu"]')
      focusRichTextMenuItem(submenu, 'first')

      const focusedItem =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      focusedItem
        ?.querySelector<HTMLElement>('.rich-text-table-option-body')
        ?.dispatchEvent(new MouseEvent('mouseenter'))
    })
  })
}

function focusStructureParent(item: HTMLElement) {
  clearTimeout(submenuFocusTimer)
  submenuFocusTimer = setTimeout(() => {
    if (showStructureMenu.value && item.isConnected) {
      item.focus()
    }
  })
}

function getStructureMenuProps(option?: DropdownOption) {
  const labels: Record<string, string> = {
    'table-row-actions': '行操作',
    'table-column-actions': '列操作',
  }
  const key = option?.key === undefined ? undefined : String(option.key)

  return {
    role: 'menu',
    'aria-label': (key && labels[key]) || '表格结构操作',
  }
}

function openSizePicker(entry: 'active' | 'last' = 'active') {
  if (isDisabled.value) {
    return
  }

  showSizePicker.value = true
  void nextTick(() => {
    sizePicker.value?.open(entry === 'last' ? 'last' : 'first')
  })
}

function openStructureMenu(entry: 'active' | 'last' = 'active') {
  if (isDisabled.value) {
    return
  }

  showStructureMenu.value = true
  focusStructureMenu(entry)
}

function handleSizePickerShow(nextShow: boolean) {
  if (nextShow) {
    openSizePicker()
  } else {
    showSizePicker.value = false
  }
}

function handleStructureShow(nextShow: boolean) {
  if (!nextShow && structureSelectSucceeded === false) {
    structureSelectSucceeded = null
    return
  }

  structureSelectSucceeded = null
  closeStructureOnFocusout = false
  showStructureMenu.value = nextShow

  if (nextShow) {
    focusStructureMenu('active')
  } else {
    clearTimeout(structureFocusTimer)
    clearTimeout(submenuFocusTimer)
    structureFocusTimer = undefined
    submenuFocusTimer = undefined
    pendingStructureFocus = undefined
  }
}

function runStructureAction(key: string | number) {
  const item = findTableActionItem(tableActionItems, key)
  return item ? runRichTextAction(editor, item.action) : false
}

function handleStructureSelect(key: string | number) {
  structureSelectSucceeded = runStructureAction(key)
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    isDisabled.value ||
    !['ArrowDown', 'ArrowUp'].includes(event.key)
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  const entry = event.key === 'ArrowUp' ? 'last' : 'active'

  if (context.value) {
    openStructureMenu(entry)
  } else {
    openSizePicker(entry)
  }
}

function handleStructureKeydown(event: KeyboardEvent) {
  if (!showStructureMenu.value || event.defaultPrevented || event.isComposing) {
    return
  }

  if (event.key === 'Tab') {
    closeStructureOnFocusout = true
    return
  }

  const menuItem =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(
          '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
        )
      : null
  const actionItem = menuItem?.matches('[data-rich-text-table-action]') ? menuItem : null
  const submenuItem = menuItem?.matches('[data-rich-text-table-submenu]') ? menuItem : null

  if (actionItem && ['Enter', ' '].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()

    if (runStructureAction(actionItem.dataset.richTextTableAction!)) {
      showStructureMenu.value = false
    }
    return
  }

  if (submenuItem && ['ArrowRight', 'Enter', ' '].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
    focusStructureSubmenu(submenuItem)
    return
  }

  if (event.key === 'ArrowLeft') {
    const menu =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[role="menu"]') : null
    const parent = getSubmenuParent(menu)

    if (parent) {
      focusStructureParent(parent)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    return
  }

  handleRichTextMenuKeydown(event, {
    trigger: getTrigger(),
    close: () => {
      showStructureMenu.value = false
    },
  })
}

function handleStructureFocusout(event: FocusEvent) {
  if (
    !closeStructureOnFocusout ||
    (event.relatedTarget instanceof Node && root.value?.contains(event.relatedTarget))
  ) {
    return
  }

  closeStructureOnFocusout = false
  showStructureMenu.value = false
}

watch(context, (nextContext) => {
  if ((showSizePicker.value && nextContext) || (showStructureMenu.value && !nextContext)) {
    closePopup()
  }
})

editor.on('transaction', sync)
onBeforeUnmount(() => {
  clearTimeout(structureFocusTimer)
  clearTimeout(submenuFocusTimer)
  pendingStructureFocus = undefined
  editor.off('transaction', sync)
})
</script>

<template>
  <div
    ref="root"
    class="contents"
    @keydown="handleStructureKeydown"
    @focusout="handleStructureFocusout"
  >
    <NDropdown
      v-if="isActive"
      trigger="click"
      placement="bottom-start"
      :show="showStructureMenu"
      :options="structureOptions"
      :node-props="getTableDropdownNodeProps"
      :disabled="isDisabled"
      :keyboard="true"
      :to="false"
      :menu-props="getStructureMenuProps"
      @update:show="handleStructureShow"
      @select="handleStructureSelect"
    >
      <NButton
        data-test="rich-text-table"
        data-rich-text-toolbar-item="table"
        data-active="true"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        type="primary"
        secondary
        :title="buttonLabel"
        :aria-label="buttonLabel"
        aria-pressed="true"
        aria-haspopup="menu"
        :aria-expanded="showStructureMenu"
        @keydown="handleTriggerKeydown"
      >
        <span class="i-[lucide--table-2]" aria-hidden="true" />
      </NButton>
    </NDropdown>

    <NPopover
      v-else
      trigger="click"
      placement="bottom-start"
      :show="showSizePicker"
      :disabled="isDisabled"
      :to="false"
      @update:show="handleSizePickerShow"
    >
      <template #trigger>
        <NButton
          data-test="rich-text-table"
          data-rich-text-toolbar-item="table"
          :disabled="isDisabled"
          size="small"
          style="--n-padding: 0 6px"
          quaternary
          :title="buttonLabel"
          :aria-label="buttonLabel"
          aria-pressed="false"
          aria-haspopup="dialog"
          :aria-expanded="showSizePicker"
          @keydown="handleTriggerKeydown"
        >
          <span class="i-[lucide--table-2]" aria-hidden="true" />
        </NButton>
      </template>

      <TableSizePicker
        ref="sizePicker"
        :editor="editor"
        :on-close="closePopup"
        :on-escape="restoreTrigger"
      />
    </NPopover>
  </div>
</template>
