<script setup lang="ts">
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import { NButton } from 'naive-ui'
import { runRichTextAction } from '../../../editor/action'
import { deleteTableActionItem } from '../editor'
import TableQuickBarActionDropdown from './TableQuickBarActionDropdown.vue'
import {
  tableAlignmentActionItems,
  tableCellActionItems,
  tableColumnActionItems,
  tableRowActionItems,
} from './dropdown'

const props = defineProps<RichTextQuickBarComponentProps>()
const editor = props.editor
</script>

<template>
  <TableQuickBarActionDropdown
    :editor="editor"
    trigger-key="table-rows"
    trigger-label="行"
    trigger-icon="i-[lucide--rows-3]"
    :items="tableRowActionItems"
  />
  <TableQuickBarActionDropdown
    :editor="editor"
    trigger-key="table-columns"
    trigger-label="列"
    trigger-icon="i-[lucide--columns-3]"
    :items="tableColumnActionItems"
  />
  <TableQuickBarActionDropdown
    :editor="editor"
    trigger-key="table-cells"
    trigger-label="单元格"
    trigger-icon="i-[lucide--table-properties]"
    :items="tableCellActionItems"
  />
  <TableQuickBarActionDropdown
    :editor="editor"
    trigger-key="table-alignment"
    trigger-label="对齐"
    trigger-icon="i-[lucide--align-left]"
    :items="tableAlignmentActionItems"
  />
  <NButton
    data-test="rich-text-quick-bar-table-delete"
    data-rich-text-toolbar-item="table-delete"
    size="small"
    style="--n-padding: 0 6px"
    type="error"
    quaternary
    title="删除表格"
    aria-label="删除表格"
    @click="runRichTextAction(editor, deleteTableActionItem.action)"
  >
    <span :class="[deleteTableActionItem.icon, 'size-4']" aria-hidden="true" />
  </NButton>
</template>
