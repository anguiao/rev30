<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton, NPopover } from 'naive-ui'
import { computed, nextTick, ref, watch } from 'vue'
import { setHighlightAction, unsetHighlightAction } from '../editor'
import type { HighlightColorOption } from '../colors'

interface HighlightColorControlProps {
  editor: Editor
  colors: readonly HighlightColorOption[]
  surface: 'toolbar' | 'quick-bar'
  disabled?: boolean
}

const props = withDefaults(defineProps<HighlightColorControlProps>(), {
  disabled: false,
})

const emit = defineEmits<{
  close: []
}>()

const editor = props.editor
const show = ref(false)
const panel = ref<HTMLElement | null>(null)

function getHighlightColors() {
  const { doc, selection, storedMarks } = editor.state

  if (selection.empty) {
    const highlight = (storedMarks ?? selection.$from.marks()).find(
      (mark) => mark.type.name === 'highlight',
    )
    const color = highlight?.attrs.color
    return typeof color === 'string' ? new Set([color.trim().toLowerCase()]) : new Set<string>()
  }

  const colors = new Set<string>()

  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (!node.isText) {
      return
    }

    const highlight = node.marks.find((mark) => mark.type.name === 'highlight')
    const color = highlight?.attrs.color

    if (typeof color === 'string') {
      colors.add(color.trim().toLowerCase())
    }
  })

  return colors
}

const activeColors = computed(getHighlightColors)
const isActive = computed(() => activeColors.value.size > 0)
const selectedColorKey = computed(() => {
  if (activeColors.value.size !== 1) {
    return null
  }

  const [color] = activeColors.value
  return props.colors.find((option) => option.value.toLowerCase() === color)?.key ?? null
})
function canRunAction(command: ReturnType<typeof setHighlightAction.command>) {
  if (props.disabled) {
    return false
  }

  return editor.can().command(command)
}

function isColorDisabled(color: HighlightColorOption['value']) {
  return !canRunAction(setHighlightAction.command(color))
}

const isClearDisabled = computed(() => !canRunAction(unsetHighlightAction.command()))
const isDisabled = computed(
  () =>
    props.disabled ||
    (props.colors.every((color) => isColorDisabled(color.value)) && isClearDisabled.value),
)
const dataTestPrefix = computed(() =>
  props.surface === 'toolbar' ? 'rich-text-highlight' : 'rich-text-quick-bar-highlight',
)

function close() {
  if (!show.value) {
    return
  }

  show.value = false
  emit('close')
}

function cancel() {
  if (!show.value) {
    return
  }

  show.value = false
  editor.commands.focus()
}

function open() {
  if (isDisabled.value) {
    return
  }

  show.value = true
  void nextTick(() => panel.value?.querySelector<HTMLElement>('button:not(:disabled)')?.focus())
}

function toggle() {
  if (show.value) {
    cancel()
  } else {
    open()
  }
}

function handleTriggerMousedown(event: MouseEvent) {
  if (props.surface === 'quick-bar') {
    event.preventDefault()
  }
}

function runAction(command: ReturnType<typeof setHighlightAction.command>) {
  if (props.disabled) {
    return false
  }

  return editor.commands.command(command)
}

function applyColor(color: HighlightColorOption['value']) {
  if (runAction(setHighlightAction.command(color))) {
    close()
  }
}

function clearHighlight() {
  if (runAction(unsetHighlightAction.command())) {
    close()
  }
}

function handleShow(nextShow: boolean) {
  if (nextShow) {
    open()
  } else if (show.value) {
    close()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  cancel()
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      close()
    }
  },
)
</script>

<template>
  <div class="contents">
    <NPopover
      :show="show"
      trigger="manual"
      placement="bottom"
      :to="false"
      :disabled="disabled"
      @update:show="handleShow"
      @clickoutside="close"
    >
      <template #trigger>
        <NButton
          :data-test="dataTestPrefix"
          :data-active="isActive ? 'true' : undefined"
          :data-rich-text-quick-bar-roving="surface === 'quick-bar' ? '' : undefined"
          :disabled="isDisabled"
          size="small"
          style="--n-padding: 0 6px"
          :type="isActive ? 'primary' : 'default'"
          :secondary="isActive"
          :quaternary="!isActive"
          title="高亮"
          aria-label="高亮"
          :aria-pressed="isActive"
          aria-haspopup="menu"
          :aria-expanded="show"
          @mousedown="handleTriggerMousedown"
          @click="toggle"
        >
          <span class="i-[lucide--highlighter]" aria-hidden="true" />
        </NButton>
      </template>

      <div
        ref="panel"
        class="flex items-center gap-1"
        role="menu"
        aria-label="高亮颜色"
        @keydown="handleKeydown"
      >
        <NButton
          v-for="color in colors"
          :key="color.key"
          :data-test="`${dataTestPrefix}-${color.key}`"
          :data-active="selectedColorKey === color.key ? 'true' : undefined"
          :disabled="isColorDisabled(color.value)"
          size="small"
          style="--n-padding: 0 6px"
          :type="selectedColorKey === color.key ? 'primary' : 'default'"
          :secondary="selectedColorKey === color.key"
          :quaternary="selectedColorKey !== color.key"
          :title="color.label"
          :aria-label="color.label"
          :aria-pressed="selectedColorKey === color.key"
          role="menuitem"
          @mousedown.prevent
          @click="applyColor(color.value)"
        >
          <span
            class="inline-block size-4 rounded-sm border border-(--rich-text-theme-input-border-color)"
            :style="{ backgroundColor: color.value }"
            aria-hidden="true"
          />
        </NButton>

        <NButton
          :data-test="`${dataTestPrefix}-clear`"
          :disabled="isClearDisabled"
          size="small"
          style="--n-padding: 0 6px"
          quaternary
          title="清除高亮"
          aria-label="清除高亮"
          role="menuitem"
          @mousedown.prevent
          @click="clearHighlight"
        >
          <span class="i-[lucide--eraser] scale-110" aria-hidden="true" />
        </NButton>
      </div>
    </NPopover>
  </div>
</template>
