<script setup lang="ts">
import type { RichTextQuickbarInjectedProps } from '../../../vue/quickbar'
import { getRichTextQuickbarLayerId } from '../../../vue/quickbar'
import {
  captureRichTextSelection,
  markRichTextSurfaceTransactionCommand,
  restoreRichTextSelection,
  restoreRichTextSelectionCommand,
  type RichTextSelectionSnapshot,
  useRichTextTargetInvalidation,
} from '../../../vue/selection'
import {
  type RichTextOverlayCloseReason,
  useRichTextToolbarOverlay,
} from '../../../vue/overlay-state'
import { NButton, NPopover } from 'naive-ui'
import { computed, nextTick, ref, watch } from 'vue'
import { setHighlightAction, unsetHighlightAction } from '../editor'
import type { HighlightColorOption } from '../colors'

interface HighlightColorControlProps extends RichTextQuickbarInjectedProps {
  colors: readonly HighlightColorOption[]
  surface: 'toolbar' | 'quickbar'
}

const props = withDefaults(defineProps<HighlightColorControlProps>(), {
  disabled: false,
})

const emit = defineEmits<{
  close: [reason: RichTextOverlayCloseReason]
}>()

const editor = props.editor
const owner = Symbol('rich-text-highlight-control')
const layerId = getRichTextQuickbarLayerId(editor)
const show = ref(false)
const target = ref<RichTextSelectionSnapshot | null>(null)
const panel = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)

const toolbarOverlay = useRichTextToolbarOverlay(() => close('outside'))

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
function canRunTargetedAction(command: ReturnType<typeof setHighlightAction.command>) {
  if (props.disabled) {
    return false
  }

  const selection = target.value ?? captureRichTextSelection(editor)

  return editor
    .can()
    .chain()
    .command(restoreRichTextSelectionCommand(selection))
    .command(command)
    .command(restoreRichTextSelectionCommand(selection))
    .run()
}

function isColorDisabled(color: HighlightColorOption['value']) {
  return !canRunTargetedAction(setHighlightAction.command(color))
}

const isClearDisabled = computed(() => !canRunTargetedAction(unsetHighlightAction.command()))
const isDisabled = computed(
  () =>
    props.disabled ||
    (props.colors.every((color) => isColorDisabled(color.value)) && isClearDisabled.value),
)
const dataTestPrefix = computed(() =>
  props.surface === 'toolbar' ? 'rich-text-highlight' : 'rich-text-quickbar-highlight',
)

function close(reason: RichTextOverlayCloseReason) {
  if (!show.value && !target.value) {
    return
  }

  const selection = target.value
  show.value = false
  target.value = null

  if (props.surface === 'toolbar') {
    toolbarOverlay.close()
  }

  if (reason === 'cancel' && selection) {
    restoreRichTextSelection(editor, selection)
  }

  emit('close', reason)
}

function open() {
  if (isDisabled.value) {
    return
  }

  target.value = captureRichTextSelection(editor)

  if (props.surface === 'toolbar') {
    toolbarOverlay.open()
  }

  show.value = true
  void nextTick(() => panel.value?.querySelector<HTMLElement>('button:not(:disabled)')?.focus())
}

function toggle() {
  if (show.value) {
    close('cancel')
  } else {
    open()
  }
}

function runTargetedAction(command: ReturnType<typeof setHighlightAction.command>) {
  const selection = target.value

  if (!selection || props.disabled) {
    return false
  }

  return editor
    .chain()
    .command(restoreRichTextSelectionCommand(selection))
    .command(markRichTextSurfaceTransactionCommand(owner))
    .command(command)
    .command(restoreRichTextSelectionCommand(selection, true))
    .focus()
    .run()
}

function applyColor(color: HighlightColorOption['value']) {
  if (runTargetedAction(setHighlightAction.command(color))) {
    close('outside')
  }
}

function clearHighlight() {
  if (runTargetedAction(unsetHighlightAction.command())) {
    close('outside')
  }
}

function handleShow(nextShow: boolean) {
  if (nextShow) {
    open()
  } else if (show.value) {
    close('outside')
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  close('cancel')
}

useRichTextTargetInvalidation(
  editor,
  owner,
  () => show.value,
  () => close('invalidated'),
)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      close('invalidated')
    }
  },
)

defineExpose({
  close,
  focusInitialControl: () => {
    const button = root.value?.querySelector<HTMLElement>(`[data-test="${dataTestPrefix.value}"]`)
    button?.focus()
    return button !== null
  },
})
</script>

<template>
  <div ref="root" class="contents">
    <NPopover
      :show="show"
      trigger="manual"
      placement="bottom"
      :to="toolbarOverlay.target.value"
      :disabled="disabled"
      @update:show="handleShow"
      @clickoutside="close('outside')"
    >
      <template #trigger>
        <NButton
          :data-test="dataTestPrefix"
          :data-active="isActive ? 'true' : undefined"
          :data-rich-text-quickbar-roving="surface === 'quickbar' ? '' : undefined"
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
          @mousedown.prevent
          @click="toggle"
        >
          <span class="i-[lucide--highlighter]" aria-hidden="true" />
        </NButton>
      </template>

      <div
        ref="panel"
        :data-rich-text-quickbar-subinterface="surface === 'quickbar' ? layerId : undefined"
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
