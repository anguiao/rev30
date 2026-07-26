<script setup lang="ts">
import { computed } from 'vue'
import type { RichTextQuickBarComponentProps } from '../../../vue/quick-bar'
import { resolveLinkRange } from '../range'
import LinkEditor from './LinkEditor.vue'

const props = defineProps<RichTextQuickBarComponentProps>()

const emit = defineEmits<{
  dismiss: []
}>()

const editor = props.editor
const range = computed(() => resolveLinkRange(editor))
</script>

<template>
  <LinkEditor
    v-if="range"
    :key="range.from"
    :editor="editor"
    :range="range"
    @close="emit('dismiss')"
  />
</template>
