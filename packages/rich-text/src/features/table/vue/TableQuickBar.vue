<script setup lang="ts">
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import { NButton } from 'naive-ui'
import { computed, onBeforeUnmount, ref } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../../editor/action'
import {
  deleteTableAction,
  deleteTableActionItem,
  toggleHeaderRowAction,
  toggleHeaderRowActionItem,
  resolveRichTextTableContext,
  addColumnAfterActionItem,
  addColumnBeforeActionItem,
  deleteColumnActionItem,
  addRowAfterActionItem,
  addRowBeforeActionItem,
  deleteRowActionItem,
} from '../editor'
import TableActionSubmenu from './TableActionSubmenu.vue'

const props = defineProps<RichTextQuickBarComponentProps>()
const editor = props.editor
const version = ref(0)

const context = computed(() => {
  void version.value
  return resolveRichTextTableContext(editor.state.selection)
})
const headerActive = computed(() => {
  void version.value
  return toggleHeaderRowAction.isActive?.(editor) ?? false
})
const headerDisabled = computed(() => {
  void version.value
  return !canRunRichTextAction(editor, toggleHeaderRowAction)
})
const deleteTableDisabled = computed(() => {
  void version.value
  return !canRunRichTextAction(editor, deleteTableAction)
})

function sync() {
  version.value += 1
}

function runHeaderToggle() {
  if (!headerDisabled.value) {
    runRichTextAction(editor, toggleHeaderRowAction)
  }
}

function runDeleteTable() {
  if (!deleteTableDisabled.value) {
    runRichTextAction(editor, deleteTableAction)
  }
}

editor.on('transaction', sync)
onBeforeUnmount(() => editor.off('transaction', sync))

const rowItems = [addRowBeforeActionItem, addRowAfterActionItem, deleteRowActionItem] as const
const columnItems = [
  addColumnBeforeActionItem,
  addColumnAfterActionItem,
  deleteColumnActionItem,
] as const
</script>

<template>
  <div v-if="context" class="contents">
    <TableActionSubmenu
      :editor="editor"
      trigger-label="行"
      trigger-icon="i-[lucide--rows-3]"
      trigger-test="rich-text-quick-bar-table-rows"
      menu-label="行操作"
      :items="rowItems"
      roving-item-key="table-rows"
      :on-close="() => undefined"
    />
    <TableActionSubmenu
      :editor="editor"
      trigger-label="列"
      trigger-icon="i-[lucide--columns-3]"
      trigger-test="rich-text-quick-bar-table-columns"
      menu-label="列操作"
      :items="columnItems"
      roving-item-key="table-columns"
      :on-close="() => undefined"
    />
    <NButton
      data-test="rich-text-quick-bar-table-header"
      data-rich-text-toolbar-item="table-header"
      :data-active="headerActive ? 'true' : undefined"
      :disabled="headerDisabled"
      size="small"
      style="--n-padding: 0 6px"
      :type="headerActive ? 'primary' : 'default'"
      :secondary="headerActive"
      :quaternary="!headerActive"
      title="首行表头"
      aria-label="首行表头"
      :aria-pressed="headerActive"
      @click="runHeaderToggle"
    >
      <span :class="[toggleHeaderRowActionItem.icon, 'size-4']" aria-hidden="true" />
    </NButton>
    <NButton
      data-test="rich-text-quick-bar-table-delete"
      data-rich-text-toolbar-item="table-delete"
      :disabled="deleteTableDisabled"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="删除表格"
      aria-label="删除表格"
      @click="runDeleteTable"
    >
      <span :class="[deleteTableActionItem.icon, 'size-4']" aria-hidden="true" />
    </NButton>
  </div>
</template>
