<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar/types'
import { NButton, NPopover } from 'naive-ui'
import { computed } from 'vue'

interface HighlightColorOption {
  key: string
  label: string
  value: string
}

interface HighlightToolbarControlProps extends RichTextToolbarControlInjectedProps {
  colors: readonly HighlightColorOption[]
}

const props = withDefaults(defineProps<HighlightToolbarControlProps>(), {
  disabled: false,
})

const isDisabled = computed(() => props.disabled || !props.editor)

const currentColor = computed(() => {
  const color = props.editor?.getAttributes('highlight').color

  return typeof color === 'string' ? color.toLowerCase() : null
})

const selectedColorKey = computed(
  () => props.colors.find((color) => color.value === currentColor.value)?.key ?? null,
)

const isActive = computed(() => props.editor?.isActive('highlight') ?? false)

function applyColor(color: string) {
  if (isDisabled.value || !props.editor) {
    return
  }

  props.editor.commands.setHighlight({ color })
}

function clearHighlight() {
  if (isDisabled.value || !props.editor) {
    return
  }

  props.editor.commands.unsetHighlight()
}
</script>

<template>
  <NPopover trigger="click" placement="bottom-start" :disabled="isDisabled">
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

    <div class="flex items-center gap-1 p-1">
      <NButton
        v-for="color in colors"
        :key="color.key"
        :data-test="`rich-text-highlight-${color.key}`"
        :data-active="selectedColorKey === color.key ? 'true' : undefined"
        size="small"
        quaternary
        :title="color.label"
        :aria-label="color.label"
        :aria-pressed="selectedColorKey === color.key"
        @mousedown.prevent
        @click="applyColor(color.value)"
      >
        <span
          class="inline-block size-4 rounded-sm border border-(--app-input-border-color)"
          :style="{ backgroundColor: color.value }"
          aria-hidden="true"
        />
      </NButton>

      <NButton
        data-test="rich-text-highlight-clear"
        size="small"
        quaternary
        title="清除高亮"
        aria-label="清除高亮"
        @mousedown.prevent
        @click="clearHighlight"
      >
        <span class="i-[lucide--eraser]" aria-hidden="true" />
      </NButton>
    </div>
  </NPopover>
</template>
