<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton, NPopover } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { RichTextToolbarControlProps } from '../../../vue/toolbar'
import { canRunRichTextAction } from '../../../editor/action'
import { deleteTableAction, resolveRichTextTableContext } from '../editor'
import { insertTableAction } from '../editor'
import TableSizePicker from './TableSizePicker.vue'
import TableStructureMenu from './TableStructureMenu.vue'

const props = withDefaults(defineProps<RichTextToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const sizePicker = ref<InstanceType<typeof TableSizePicker> | null>(null)
const show = ref(false)
const mode = ref<'size' | 'structure'>('size')
const version = ref(0)

const context = computed(() => {
  void version.value
  return resolveRichTextTableContext(editor.state.selection)
})

const isActive = computed(() => context.value !== null)
const isDisabled = computed(() => {
  void version.value

  if (props.disabled) {
    return true
  }

  return context.value
    ? !canRunRichTextAction(editor, deleteTableAction)
    : !canRunRichTextAction(editor, insertTableAction, 1, 1)
})
const buttonLabel = computed(() => (isActive.value ? '表格操作' : '表格'))

function sync() {
  version.value += 1
}

function getTrigger() {
  return root.value?.querySelector<HTMLElement>('[data-rich-text-toolbar-item="table"]') ?? null
}

function closePopup() {
  show.value = false
}

function restoreTrigger() {
  closePopup()
  void nextTick(() => getTrigger()?.focus())
}

function open(nextMode: 'size' | 'structure', entry: 'active' | 'last' = 'active') {
  if (isDisabled.value) {
    return
  }

  mode.value = nextMode
  show.value = true
  void nextTick(() => {
    if (nextMode === 'size') {
      sizePicker.value?.open(entry === 'last' ? 'last' : 'first')
    }
  })
}

function handleShow(nextShow: boolean) {
  if (!nextShow) {
    show.value = false
    return
  }

  open(context.value ? 'structure' : 'size')
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
  open(context.value ? 'structure' : 'size', event.key === 'ArrowUp' ? 'last' : 'active')
}

watch(context, (nextContext) => {
  if (
    show.value &&
    ((nextContext && mode.value === 'size') || (!nextContext && mode.value === 'structure'))
  ) {
    closePopup()
  }
})

editor.on('transaction', sync)
onBeforeUnmount(() => editor.off('transaction', sync))
</script>

<template>
  <div ref="root" class="contents">
    <NPopover
      trigger="click"
      placement="bottom-start"
      :show="show"
      :disabled="isDisabled"
      :to="false"
      @update:show="handleShow"
    >
      <template #trigger>
        <NButton
          data-test="rich-text-table"
          data-rich-text-toolbar-item="table"
          :data-active="isActive ? 'true' : undefined"
          :disabled="isDisabled"
          size="small"
          style="--n-padding: 0 6px"
          :type="isActive ? 'primary' : 'default'"
          :secondary="isActive"
          :quaternary="!isActive"
          :title="buttonLabel"
          :aria-label="buttonLabel"
          :aria-pressed="isActive"
          aria-haspopup="dialog"
          :aria-expanded="show"
          @keydown="handleTriggerKeydown"
        >
          <span class="i-[lucide--table-2]" aria-hidden="true" />
        </NButton>
      </template>

      <TableSizePicker
        v-if="mode === 'size'"
        ref="sizePicker"
        :editor="editor"
        :on-close="closePopup"
        :on-escape="restoreTrigger"
      />
      <TableStructureMenu
        v-else
        :editor="editor"
        :trigger="getTrigger()"
        :on-close="closePopup"
        :on-escape="restoreTrigger"
      />
    </NPopover>
  </div>
</template>
