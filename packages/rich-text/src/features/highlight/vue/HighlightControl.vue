<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton, NPopover } from 'naive-ui'
import { computed, nextTick, ref } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../../editor/action'
import {
  focusRichTextPaletteItem,
  handleRichTextPaletteKeydown,
} from '../../../vue/interactions/focus'
import { setHighlightAction, unsetHighlightAction } from '../editor'
import { highlightColorOptions, type HighlightColor } from '../colors'

interface HighlightControlProps {
  editor: Editor
  disabled?: boolean
}

const props = withDefaults(defineProps<HighlightControlProps>(), {
  disabled: false,
})

const editor = props.editor
const show = ref(false)
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)

const isActive = computed(() => editor.isActive('highlight'))
const selectedColorKey = computed(
  () =>
    highlightColorOptions.find((option) => editor.isActive('highlight', { color: option.value }))
      ?.key,
)

function canApplyColor(color: HighlightColor) {
  return !props.disabled && canRunRichTextAction(editor, setHighlightAction, color)
}

const canClear = computed(
  () => !props.disabled && canRunRichTextAction(editor, unsetHighlightAction),
)

const isDisabled = computed(
  () => !canClear.value && highlightColorOptions.every((color) => !canApplyColor(color.value)),
)

function applyColor(color: HighlightColor) {
  runRichTextAction(editor, setHighlightAction, color)
  show.value = false
}

function clearHighlight() {
  runRichTextAction(editor, unsetHighlightAction)
  show.value = false
}

function handleShow(isOpen: boolean) {
  if (isOpen) {
    void nextTick(() => focusRichTextPaletteItem(panel.value, 'active'))
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
    focusRichTextPaletteItem(panel.value, event.key === 'ArrowUp' ? 'last' : 'active'),
  )
}

function handleEscape(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  show.value = false
  void nextTick(() =>
    root.value?.querySelector<HTMLElement>('[data-rich-text-toolbar-item="highlight"]')?.focus(),
  )
}

function handlePanelKeydown(event: KeyboardEvent) {
  handleEscape(event)
  handleRichTextPaletteKeydown(event, {
    root: panel.value,
    columns: highlightColorOptions.length + 1,
  })
}
</script>

<template>
  <div ref="root" class="contents">
    <NPopover
      v-model:show="show"
      trigger="click"
      placement="bottom"
      :to="false"
      :disabled="isDisabled"
      @update:show="handleShow"
    >
      <template #trigger>
        <NButton
          data-test="rich-text-highlight"
          :data-active="isActive ? 'true' : undefined"
          data-rich-text-toolbar-item="highlight"
          :disabled="isDisabled"
          size="small"
          style="--n-padding: 0 6px"
          :type="isActive ? 'primary' : 'default'"
          :secondary="isActive"
          :quaternary="!isActive"
          title="高亮"
          aria-label="高亮"
          :aria-pressed="isActive"
          :aria-expanded="show"
          @keydown="handleTriggerKeydown"
        >
          <span class="i-[lucide--highlighter]" aria-hidden="true" />
        </NButton>
      </template>

      <div
        ref="panel"
        class="flex items-center gap-1"
        role="group"
        aria-label="高亮颜色"
        @keydown="handlePanelKeydown"
      >
        <NButton
          v-for="color in highlightColorOptions"
          :key="color.key"
          :data-test="`rich-text-highlight-${color.key}`"
          data-rich-text-palette-item
          :data-active="selectedColorKey === color.key ? 'true' : undefined"
          :disabled="!canApplyColor(color.value)"
          size="small"
          style="--n-padding: 0 6px"
          :type="selectedColorKey === color.key ? 'primary' : 'default'"
          :secondary="selectedColorKey === color.key"
          :quaternary="selectedColorKey !== color.key"
          :title="color.label"
          :aria-label="color.label"
          :aria-pressed="selectedColorKey === color.key"
          @click="applyColor(color.value)"
        >
          <span
            class="inline-block size-4 rounded-sm border border-stone-200 dark:border-zinc-500/60"
            :style="{ backgroundColor: color.value }"
            aria-hidden="true"
          />
        </NButton>

        <NButton
          data-test="rich-text-highlight-clear"
          data-rich-text-palette-item
          :disabled="!canClear"
          size="small"
          style="--n-padding: 0 6px"
          quaternary
          title="清除高亮"
          aria-label="清除高亮"
          @click="clearHighlight"
        >
          <span class="i-[lucide--eraser] scale-110" aria-hidden="true" />
        </NButton>
      </div>
    </NPopover>
  </div>
</template>
