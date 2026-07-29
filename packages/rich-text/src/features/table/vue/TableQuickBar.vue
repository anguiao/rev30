<script setup lang="ts">
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import { NButton } from 'naive-ui'
import { computed, onBeforeUnmount, ref } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../../editor/action'
import { deleteTableAction, deleteTableActionItem, resolveRichTextTableContext } from '../editor'
import TableActionDropdown from './TableActionDropdown.vue'
import { tableColumnActionItems, tableRowActionItems } from './dropdown'

const props = defineProps<RichTextQuickBarComponentProps>()
const editor = props.editor
const version = ref(0)

const context = computed(() => {
  void version.value
  return resolveRichTextTableContext(editor.state.selection)
})
const deleteTableDisabled = computed(() => {
  void version.value
  return !canRunRichTextAction(editor, deleteTableAction)
})

function sync() {
  version.value += 1
}

function runDeleteTable() {
  if (!deleteTableDisabled.value) {
    runRichTextAction(editor, deleteTableAction)
  }
}

editor.on('transaction', sync)
onBeforeUnmount(() => editor.off('transaction', sync))
</script>

<template>
  <div v-if="context" class="contents">
    <TableActionDropdown
      :editor="editor"
      trigger-label="行"
      trigger-icon="i-[lucide--rows-3]"
      trigger-test="rich-text-quick-bar-table-rows"
      :items="tableRowActionItems"
      roving-item-key="table-rows"
    />
    <TableActionDropdown
      :editor="editor"
      trigger-label="列"
      trigger-icon="i-[lucide--columns-3]"
      trigger-test="rich-text-quick-bar-table-columns"
      :items="tableColumnActionItems"
      roving-item-key="table-columns"
    />
    <NButton
      data-test="rich-text-quick-bar-table-delete"
      data-rich-text-toolbar-item="table-delete"
      :disabled="deleteTableDisabled"
      size="small"
      style="--n-padding: 0 6px"
      type="error"
      quaternary
      title="删除表格"
      aria-label="删除表格"
      @click="runDeleteTable"
    >
      <span :class="[deleteTableActionItem.icon, 'size-4']" aria-hidden="true" />
    </NButton>
  </div>
</template>
