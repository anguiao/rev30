<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton, NPopover } from 'naive-ui'
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../../../client/editor/action'
import {
  focusRichTextGridItem,
  handleRichTextGridKeydown,
} from '../../../../client/vue/interactions/focus'
import { setTextColorAction, unsetTextColorAction } from '../editor'
import type { TextStyleOption } from '../../core/options'

const props = defineProps<{
  editor: Editor
  colors: readonly TextStyleOption[]
  disabled: boolean
}>()

const editor = props.editor
const show = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const panel = useTemplateRef<HTMLElement>('panel')

const currentColor = computed(() => editor.getAttributes('textStyle').color)
const currentColorOption = computed(() =>
  props.colors.find((option) => option.value === currentColor.value),
)
const colorOptions = computed(() =>
  props.colors.map((option) => ({
    ...option,
    active: currentColorOption.value?.key === option.key,
    disabled: props.disabled || !canRunRichTextAction(editor, setTextColorAction, option.value),
  })),
)
const triggerTitle = computed(
  () => `文字颜色：${currentColorOption.value?.label ?? currentColor.value ?? '默认'}`,
)

const canReset = computed(
  () => !props.disabled && canRunRichTextAction(editor, unsetTextColorAction),
)
const isDisabled = computed(
  () => !canReset.value && colorOptions.value.every((option) => option.disabled),
)

function setColor(value: string) {
  runRichTextAction(editor, setTextColorAction, value)
  show.value = false
}

function resetColor() {
  runRichTextAction(editor, unsetTextColorAction)
  show.value = false
}

function handleShow(isOpen: boolean) {
  if (isOpen) {
    void nextTick(() => focusRichTextGridItem(panel.value, 'active'))
  }
}

function handleTriggerKeydown(event: KeyboardEvent) {
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
  show.value = true
  void nextTick(() =>
    focusRichTextGridItem(panel.value, event.key === 'ArrowUp' ? 'last' : 'active'),
  )
}

function handleEscape(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || !show.value || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  show.value = false
  root.value?.querySelector<HTMLElement>('[data-rich-text-toolbar-item]')?.focus()
}

function handleKeydown(event: KeyboardEvent) {
  handleEscape(event)
  handleRichTextGridKeydown(event, { root: panel.value, columns: 5 })
}
</script>

<template>
  <div ref="root" class="contents" @keydown.capture="handleKeydown">
    <NPopover
      v-model:show="show"
      trigger="click"
      placement="bottom-start"
      :to="false"
      :disabled="isDisabled"
      @update:show="handleShow"
    >
      <template #trigger>
        <NButton
          data-test="rich-text-text-color"
          data-rich-text-toolbar-item="text-color"
          :disabled="isDisabled"
          class="justify-start!"
          size="small"
          style="--n-padding: 0 6px"
          quaternary
          :title="triggerTitle"
          :aria-label="triggerTitle"
          :aria-pressed="!!currentColor"
          :aria-expanded="show"
          @keydown="handleTriggerKeydown"
        >
          <span class="i-[lucide--palette]" aria-hidden="true" />
          <span
            class="ml-0.5 inline-block size-3 rounded-sm border border-stone-200 dark:border-zinc-500/60"
            :style="{ backgroundColor: currentColor ?? 'currentColor' }"
            aria-hidden="true"
          />
          <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
        </NButton>
      </template>

      <div ref="panel" class="grid grid-cols-5 gap-1" role="group" aria-label="文字颜色">
        <NButton
          data-test="rich-text-text-color-default"
          data-rich-text-grid-item
          :disabled="!canReset"
          size="small"
          style="--n-padding: 0 6px"
          :type="!currentColor ? 'primary' : 'default'"
          :secondary="!currentColor"
          :quaternary="!!currentColor"
          title="默认文字颜色"
          aria-label="默认文字颜色"
          :aria-pressed="!currentColor"
          @click="resetColor"
        >
          <span class="i-[lucide--rotate-ccw]" aria-hidden="true" />
        </NButton>

        <NButton
          v-for="option in colorOptions"
          :key="option.key"
          :data-test="`rich-text-text-color-${option.key}`"
          data-rich-text-grid-item
          :disabled="option.disabled"
          size="small"
          style="--n-padding: 0 6px"
          :type="option.active ? 'primary' : 'default'"
          :secondary="option.active"
          :quaternary="!option.active"
          :title="option.label"
          :aria-label="option.label"
          :aria-pressed="option.active"
          @click="setColor(option.value)"
        >
          <span
            class="inline-block size-4 rounded-sm border border-stone-200 dark:border-zinc-500/60"
            :style="{ backgroundColor: option.value }"
            aria-hidden="true"
          />
        </NButton>
      </div>
    </NPopover>
  </div>
</template>
