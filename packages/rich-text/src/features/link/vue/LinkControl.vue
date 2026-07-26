<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton, NPopover } from 'naive-ui'
import { computed, ref } from 'vue'
import { resolveLinkRange } from '../range'
import LinkEditor from './LinkEditor.vue'

const props = withDefaults(
  defineProps<{
    editor: Editor
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const editor = props.editor
const show = ref(false)
const range = computed(() => resolveLinkRange(editor))
const isActive = computed(() => editor.isActive('link'))
const isDisabled = computed(() => props.disabled || range.value === null)
</script>

<template>
  <NPopover
    v-model:show="show"
    trigger="click"
    placement="bottom-start"
    :to="false"
    :disabled="isDisabled"
  >
    <template #trigger>
      <NButton
        data-test="rich-text-link"
        data-rich-text-quick-bar-roving
        :data-active="isActive ? 'true' : undefined"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        :type="isActive ? 'primary' : 'default'"
        :secondary="isActive"
        :quaternary="!isActive"
        title="链接"
        aria-label="链接"
        :aria-pressed="isActive"
      >
        <span class="i-[lucide--link]" aria-hidden="true" />
      </NButton>
    </template>

    <LinkEditor
      v-if="show && range"
      :editor="editor"
      :range="range"
      :disabled="disabled"
      autofocus
      @close="show = false"
    />
  </NPopover>
</template>
