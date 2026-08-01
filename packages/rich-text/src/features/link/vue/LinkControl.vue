<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton, NPopover } from 'naive-ui'
import { computed, nextTick, ref, useTemplateRef } from 'vue'
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
const root = useTemplateRef<HTMLElement>('root')
const show = ref(false)

const range = computed(() => resolveLinkRange(editor))
const isActive = computed(() => editor.isActive('link'))
const isDisabled = computed(() => props.disabled || range.value === null)

function closeLinkEditor() {
  show.value = false
}

function cancelLinkEditor() {
  closeLinkEditor()

  void nextTick(() =>
    root.value?.querySelector<HTMLElement>('[data-rich-text-toolbar-item]')?.focus(),
  )
}
</script>

<template>
  <div ref="root" class="contents">
    <NPopover
      v-model:show="show"
      trigger="click"
      placement="bottom-start"
      :to="false"
      :disabled="isDisabled"
    >
      <template #trigger>
        <slot name="trigger" :disabled="isDisabled" :show="show">
          <NButton
            data-test="rich-text-link"
            data-rich-text-toolbar-item="link"
            :disabled="isDisabled"
            size="small"
            style="--n-padding: 0 6px"
            :type="isActive ? 'primary' : 'default'"
            :secondary="isActive"
            :quaternary="!isActive"
            title="链接"
            aria-label="链接"
            :aria-pressed="isActive"
            aria-haspopup="dialog"
            :aria-expanded="show"
          >
            <span class="i-[lucide--link]" aria-hidden="true" />
          </NButton>
        </slot>
      </template>

      <LinkEditor
        v-if="show && range && !disabled"
        :key="`${range.from}:${range.to}`"
        :editor="editor"
        :range="range"
        @confirm="closeLinkEditor"
        @cancel="cancelLinkEditor"
      />
    </NPopover>
  </div>
</template>
