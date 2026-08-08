<script setup lang="ts">
import type { DropdownDividerOption, DropdownOption } from 'naive-ui'
import { NButton, NDropdown, NPopover } from 'naive-ui'
import { computed, h, nextTick, ref, useTemplateRef, watch } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../../../client/editor/action'
import { useRichTextDropdownTrigger } from '../../../../client/vue/interactions/dropdown'
import { focusRichTextGridItem } from '../../../../client/vue/interactions/focus'
import type { RichTextToolbarControlProps } from '../../../../client/vue/toolbar'
import {
  deleteTableActionItem,
  getSelectedTable,
  insertTableAction,
  toggleHeaderColumnActionItem,
  toggleHeaderRowActionItem,
} from '../editor'
import TableToolbarSizePicker from './TableToolbarSizePicker.vue'
import {
  createTableDropdownOption,
  tableAlignmentActionItems,
  tableCellActionItems,
  tableColumnActionItems,
  tableRowActionItems,
  type TableDropdownOption,
} from './dropdown'

const props = withDefaults(defineProps<RichTextToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const root = useTemplateRef<HTMLElement>('root')

const isActive = computed(() => getSelectedTable(editor.state.selection) !== null)
const isDisabled = computed(
  () =>
    props.disabled || (!isActive.value && !canRunRichTextAction(editor, insertTableAction, 1, 1)),
)

function createSubmenu(key: string, label: string, icon: string, children: DropdownOption[]) {
  return {
    key,
    label,
    icon: () =>
      h('span', {
        class: [icon, 'inline-block size-4'],
        'aria-hidden': 'true',
      }),
    children,
    props: {
      'data-test': `rich-text-table-menu-${key}`,
      role: 'menuitem',
      tabindex: -1,
      'aria-haspopup': 'menu' as const,
    },
  }
}

const options = computed<(DropdownOption | DropdownDividerOption)[]>(() => {
  return [
    createSubmenu(
      'table-row-actions',
      '行',
      'i-[lucide--rows-3]',
      tableRowActionItems.map((item) => createTableDropdownOption(editor, item)),
    ),
    createSubmenu(
      'table-column-actions',
      '列',
      'i-[lucide--columns-3]',
      tableColumnActionItems.map((item) => createTableDropdownOption(editor, item)),
    ),
    createSubmenu(
      'table-cell-actions',
      '单元格',
      'i-[lucide--table-properties]',
      tableCellActionItems.map((item) => createTableDropdownOption(editor, item)),
    ),
    createSubmenu(
      'table-alignment-actions',
      '对齐',
      'i-[lucide--align-left]',
      tableAlignmentActionItems.map((item) => createTableDropdownOption(editor, item)),
    ),
    {
      type: 'divider',
      key: 'table-level-divider',
    },
    createTableDropdownOption(editor, toggleHeaderRowActionItem),
    createTableDropdownOption(editor, toggleHeaderColumnActionItem),
    {
      type: 'divider',
      key: 'table-delete-divider',
    },
    createTableDropdownOption(editor, deleteTableActionItem),
  ]
})

function handleSelect(_key: string | number, option: DropdownOption) {
  runRichTextAction(editor, (option as TableDropdownOption).action)
}

function getMenuProps(option?: DropdownOption) {
  const label = typeof option?.label === 'string' ? option.label : '表格'

  return {
    role: 'menu',
    'aria-label': `${label}操作`,
  }
}

const showSizePicker = ref(false)

const { show: showMenu, handleTriggerKeydown: handleMenuTriggerKeydown } =
  useRichTextDropdownTrigger(isDisabled)

function openSizePicker(entry: 'first' | 'last') {
  if (isDisabled.value) {
    return
  }

  showSizePicker.value = true
  void nextTick(() => {
    focusRichTextGridItem(root.value, entry)
  })
}

function closePopup() {
  showSizePicker.value = false
  showMenu.value = false
}

function cancelSizePicker() {
  closePopup()
  root.value?.querySelector<HTMLElement>('[data-rich-text-toolbar-item="table"]')?.focus()
}

function handleSizePickerVisibilityChange(visible: boolean) {
  if (visible) {
    void nextTick(() => {
      focusRichTextGridItem(root.value, 'first')
    })
  }
}

function handleSizePickerTriggerKeydown(event: KeyboardEvent) {
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
  openSizePicker(event.key === 'ArrowUp' ? 'last' : 'first')
}

watch(isActive, closePopup)
</script>

<template>
  <div ref="root" class="contents">
    <NDropdown
      v-if="isActive"
      v-model:show="showMenu"
      trigger="click"
      placement="bottom-start"
      :options="options"
      :disabled="isDisabled"
      :to="false"
      :menu-props="getMenuProps"
      @select="handleSelect"
    >
      <NButton
        data-test="rich-text-table"
        data-rich-text-toolbar-item="table"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        type="primary"
        secondary
        title="表格操作"
        aria-label="表格操作"
        aria-pressed="true"
        aria-haspopup="menu"
        :aria-expanded="showMenu"
        @keydown="handleMenuTriggerKeydown"
      >
        <span class="i-[lucide--table-2]" aria-hidden="true" />
      </NButton>
    </NDropdown>

    <NPopover
      v-else
      v-model:show="showSizePicker"
      trigger="click"
      placement="bottom-start"
      :disabled="isDisabled"
      :to="false"
      @update:show="handleSizePickerVisibilityChange"
    >
      <template #trigger>
        <NButton
          data-test="rich-text-table"
          data-rich-text-toolbar-item="table"
          :disabled="isDisabled"
          size="small"
          style="--n-padding: 0 6px"
          quaternary
          title="表格"
          aria-label="表格"
          aria-pressed="false"
          aria-haspopup="dialog"
          :aria-expanded="showSizePicker"
          @keydown="handleSizePickerTriggerKeydown"
        >
          <span class="i-[lucide--table-2]" aria-hidden="true" />
        </NButton>
      </template>

      <TableToolbarSizePicker :editor="editor" @close="closePopup" @cancel="cancelSizePicker" />
    </NPopover>
  </div>
</template>
