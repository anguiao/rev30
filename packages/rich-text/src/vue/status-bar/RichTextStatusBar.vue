<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { RichTextStatusBarConfig } from '../status-bar'

defineProps<{
  editor: Editor
  statusBar: RichTextStatusBarConfig
}>()
</script>

<template>
  <component
    :is="item.component"
    v-for="item in statusBar.items"
    :key="item.key"
    v-bind="item.props"
    :editor="editor"
  />
</template>
