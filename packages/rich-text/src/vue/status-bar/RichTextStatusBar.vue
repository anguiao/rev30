<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { RichTextStatusBarConfig } from '../status-bar'

defineProps<{
  editor: Editor
  statusBar: RichTextStatusBarConfig
}>()
</script>

<template>
  <div
    class="flex min-h-8 w-full min-w-0 shrink-0 items-center border-t border-(--rich-text-theme-input-divider-color) px-3 py-1 text-xs whitespace-nowrap text-(--rich-text-theme-muted-text-color)"
  >
    <div
      v-if="statusBar.start.length > 0"
      data-test="rich-text-status-bar-start"
      class="flex min-w-0 flex-1 items-center gap-3 overflow-hidden"
    >
      <component
        :is="item.component"
        v-for="item in statusBar.start"
        :key="item.key"
        v-bind="item.props"
        :editor="editor"
      />
    </div>

    <div
      v-if="statusBar.end.length > 0"
      data-test="rich-text-status-bar-end"
      class="ml-auto flex shrink-0 items-center gap-3"
    >
      <component
        :is="item.component"
        v-for="item in statusBar.end"
        :key="item.key"
        v-bind="item.props"
        :editor="editor"
      />
    </div>
  </div>
</template>
