<script setup lang="ts">
import type { HighlightColorOption } from '../colors'
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import { NButton, NPopover } from 'naive-ui'
import { computed } from 'vue'
import { setHighlightAction, unsetHighlightAction } from '../editor'

interface HighlightToolbarControlProps extends RichTextToolbarControlInjectedProps {
  colors: readonly HighlightColorOption[]
}

const props = withDefaults(defineProps<HighlightToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const isDisabled = computed(() => props.disabled || !editor)
const isActive = computed(() => editor?.isActive('highlight') ?? false)

const currentColor = computed(() => {
  const color = editor?.getAttributes('highlight').color

  return typeof color === 'string' ? color.trim().toLowerCase() : null
})

const selectedColorKey = computed(
  () => props.colors.find((color) => color.value.toLowerCase() === currentColor.value)?.key ?? null,
)

function applyColor(color: HighlightColorOption['value']) {
  if (isDisabled.value || !editor) {
    return
  }

  setHighlightAction.run(editor, color)
}

function clearHighlight() {
  if (isDisabled.value || !editor) {
    return
  }

  unsetHighlightAction.run(editor)
}
</script>

<template>
  <NPopover trigger="click" placement="bottom" :disabled="isDisabled">
    <template #trigger>
      <NButton
        data-test="rich-text-highlight"
        :data-active="isActive ? 'true' : undefined"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        :type="isActive ? 'primary' : 'default'"
        :secondary="isActive"
        :quaternary="!isActive"
        title="高亮"
        aria-label="高亮"
        :aria-pressed="isActive"
        @mousedown.prevent
      >
        <span class="i-[lucide--highlighter]" aria-hidden="true" />
      </NButton>
    </template>

    <div class="flex items-center gap-1">
      <NButton
        v-for="color in colors"
        :key="color.key"
        :data-test="`rich-text-highlight-${color.key}`"
        :data-active="selectedColorKey === color.key ? 'true' : undefined"
        size="small"
        style="--n-padding: 0 6px"
        :type="selectedColorKey === color.key ? 'primary' : 'default'"
        :secondary="selectedColorKey === color.key"
        :quaternary="selectedColorKey !== color.key"
        :title="color.label"
        :aria-label="color.label"
        :aria-pressed="selectedColorKey === color.key"
        @mousedown.prevent
        @click="applyColor(color.value)"
      >
        <span
          class="inline-block size-4 rounded-sm border border-input-border"
          :style="{ backgroundColor: color.value }"
          aria-hidden="true"
        />
      </NButton>

      <NButton
        data-test="rich-text-highlight-clear"
        size="small"
        style="--n-padding: 0 6px"
        quaternary
        title="清除高亮"
        aria-label="清除高亮"
        @mousedown.prevent
        @click="clearHighlight"
      >
        <span class="i-[lucide--eraser] scale-110" aria-hidden="true" />
      </NButton>
    </div>
  </NPopover>
</template>
