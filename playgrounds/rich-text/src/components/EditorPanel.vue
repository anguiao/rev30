<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import { RichTextEditor } from '@rev30/rich-text/vue'
import type { RichTextEditorPreset } from '@rev30/rich-text/vue'
import { createDefaultDocument } from '../playground/defaultDocument'

defineProps<{
  modelValue: RichTextDocument
  preset: RichTextEditorPreset
}>()

const emit = defineEmits<{
  'update:modelValue': [value: RichTextDocument]
  restore: []
}>()

function updateModel(value: RichTextDocument) {
  emit('update:modelValue', value)
}

function restoreExample() {
  emit('update:modelValue', createDefaultDocument())
  emit('restore')
}
</script>

<template>
  <section aria-labelledby="editor-panel-title" class="flex min-h-0 min-w-0 flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 id="editor-panel-title" class="text-base font-semibold">编辑</h2>
        <p class="text-sm text-stone-500 dark:text-zinc-400">使用真实 client all preset。</p>
      </div>
      <NButton secondary size="small" data-test="restore-example" @click="restoreExample">
        恢复示例
      </NButton>
    </div>

    <RichTextEditor
      :model-value="modelValue"
      :preset="preset"
      :min-height="320"
      class="min-h-0 flex-1"
      data-test="playground-editor"
      @update:model-value="updateModel"
    />
  </section>
</template>
