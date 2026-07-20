<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { NButton, NPopover } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../editor/action'
import {
  getRichTextQuickbarControlKey,
  getRichTextQuickbarLayerId,
  type RichTextQuickbarControl,
  type RichTextQuickbarControlsConfig,
} from '../quickbar'
import type { RichTextSurfaceCloseReason } from '../surface-coordinator'

interface QuickbarComponentSurface {
  close?: (reason: RichTextSurfaceCloseReason) => void
}

const props = withDefaults(
  defineProps<{
    editor: Editor
    controls: RichTextQuickbarControlsConfig
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  close: [reason: 'cancel' | 'outside' | 'invalidated']
}>()

const editor = props.editor
const layerId = getRichTextQuickbarLayerId(editor)
const toolbar = ref<HTMLElement | null>(null)
const moreTrigger = ref<HTMLElement | null>(null)
const moreMenu = ref<HTMLElement | null>(null)
const showMore = ref(false)
const componentSurfaces = new Map<string, QuickbarComponentSurface>()
let isClosing = false

function setComponentSurface(key: string, value: unknown) {
  if (value && typeof value === 'object') {
    componentSurfaces.set(key, value as QuickbarComponentSurface)
  } else {
    componentSurfaces.delete(key)
  }
}

function isActionDisabled(control: RichTextQuickbarControl) {
  return (
    props.disabled ||
    (control.type === 'action' && !canRunRichTextAction(editor, control.item.action))
  )
}

function isActionActive(control: RichTextQuickbarControl) {
  return control.type === 'action' && (control.item.action.isActive?.(editor) ?? false)
}

const primaryControls = computed(() => props.controls.primary)
const moreControls = computed(() => props.controls.more)

function getRovingButtons() {
  if (!toolbar.value) {
    return []
  }

  return Array.from(
    toolbar.value.querySelectorAll<HTMLElement>('[data-rich-text-quickbar-roving]:not(:disabled)'),
  ).filter((button) => !button.closest('[data-rich-text-quickbar-menu]'))
}

function setRovingButton(button: HTMLElement | null) {
  for (const candidate of getRovingButtons()) {
    candidate.tabIndex = candidate === button ? 0 : -1
  }
}

function syncRovingTabIndex() {
  const buttons = getRovingButtons()
  const current = buttons.find((button) => button.tabIndex === 0)
  setRovingButton(current ?? buttons[0] ?? null)
}

function focusButton(button: HTMLElement | undefined) {
  if (!button) {
    return false
  }

  setRovingButton(button)
  button.focus()
  return true
}

function focusInitialControl() {
  const buttons = getRovingButtons()
  const preferred = buttons.find((button) => button.dataset.active === 'true') ?? buttons[0]

  return focusButton(preferred)
}

function closeMore(restoreTriggerFocus: boolean) {
  if (!showMore.value) {
    return
  }

  showMore.value = false

  if (restoreTriggerFocus) {
    void nextTick(() => moreTrigger.value?.querySelector<HTMLElement>('button')?.focus())
  }
}

function toggleMore() {
  if (props.disabled) {
    return
  }

  showMore.value = !showMore.value

  if (showMore.value) {
    void nextTick(() => {
      moreMenu.value?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    })
  }
}

function runControl(control: RichTextQuickbarControl, fromMore = false) {
  if (control.type !== 'action' || isActionDisabled(control)) {
    return
  }

  const handled = runRichTextAction(editor, control.item.action)

  if (handled && fromMore) {
    closeMore(true)
  }
}

function handleToolbarKeydown(event: KeyboardEvent) {
  if (event.isComposing) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close', 'cancel')
    return
  }

  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    return
  }

  const buttons = getRovingButtons()
  const currentIndex = buttons.indexOf(event.target as HTMLElement)

  if (currentIndex < 0 || buttons.length === 0) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Home') {
    focusButton(buttons[0])
    return
  }

  if (event.key === 'End') {
    focusButton(buttons.at(-1))
    return
  }

  const offset = event.key === 'ArrowRight' ? 1 : -1
  const nextIndex = (currentIndex + offset + buttons.length) % buttons.length
  focusButton(buttons[nextIndex])
}

function handleMoreKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  closeMore(true)
}

function handleTransaction() {
  void nextTick(syncRovingTabIndex)
}

onMounted(() => {
  syncRovingTabIndex()
  editor.on('transaction', handleTransaction)
})

onBeforeUnmount(() => {
  editor.off('transaction', handleTransaction)
})

defineExpose({
  close: (reason: RichTextSurfaceCloseReason = 'outside') => {
    if (isClosing) {
      return
    }

    isClosing = true
    for (const surface of componentSurfaces.values()) {
      surface.close?.(reason)
    }
    closeMore(false)
    isClosing = false
  },
  focusInitialControl,
})
</script>

<template>
  <div ref="toolbar" class="flex items-center gap-1" @keydown="handleToolbarKeydown">
    <div
      v-for="control in primaryControls"
      :key="getRichTextQuickbarControlKey(control)"
      data-rich-text-quickbar-control
    >
      <NButton
        v-if="control.type === 'action'"
        data-rich-text-quickbar-roving
        :data-test="`rich-text-quickbar-${control.item.action.key}`"
        :data-active="isActionActive(control) ? 'true' : undefined"
        :disabled="isActionDisabled(control)"
        size="small"
        style="--n-padding: 0 6px"
        :type="isActionActive(control) ? 'primary' : 'default'"
        :secondary="isActionActive(control)"
        :quaternary="!isActionActive(control)"
        :title="control.item.label"
        :aria-label="control.item.label"
        :aria-pressed="control.item.action.isActive ? isActionActive(control) : undefined"
        @mousedown.prevent
        @click="runControl(control)"
      >
        <span :class="control.item.icon" aria-hidden="true" />
      </NButton>

      <component
        :is="control.component"
        v-else
        :ref="
          (value: unknown) => setComponentSurface(getRichTextQuickbarControlKey(control), value)
        "
        v-bind="control.props"
        :editor="editor"
        :disabled="disabled"
        @close="emit('close', $event)"
      />
    </div>

    <div v-if="moreControls.length > 0" ref="moreTrigger" data-rich-text-quickbar-control>
      <NPopover
        :show="showMore"
        trigger="manual"
        placement="bottom-start"
        :disabled="disabled"
        @clickoutside="closeMore(false)"
      >
        <template #trigger>
          <NButton
            data-test="rich-text-quickbar-more"
            data-rich-text-quickbar-roving
            :data-active="showMore ? 'true' : undefined"
            :disabled="disabled"
            size="small"
            style="--n-padding: 0 6px"
            quaternary
            title="更多"
            aria-label="更多"
            aria-haspopup="menu"
            :aria-expanded="showMore"
            @mousedown.prevent
            @click="toggleMore"
          >
            <span class="i-[lucide--ellipsis]" aria-hidden="true" />
          </NButton>
        </template>

        <div
          ref="moreMenu"
          data-rich-text-quickbar-menu
          :data-rich-text-quickbar-subinterface="layerId"
          class="flex items-center gap-1"
          role="menu"
          aria-label="更多格式"
          @keydown="handleMoreKeydown"
        >
          <template v-for="control in moreControls" :key="getRichTextQuickbarControlKey(control)">
            <NButton
              v-if="control.type === 'action'"
              data-rich-text-quickbar-action-target
              :data-test="`rich-text-quickbar-more-${control.item.action.key}`"
              :data-active="isActionActive(control) ? 'true' : undefined"
              :disabled="isActionDisabled(control)"
              size="small"
              style="--n-padding: 0 6px"
              :type="isActionActive(control) ? 'primary' : 'default'"
              :secondary="isActionActive(control)"
              :quaternary="!isActionActive(control)"
              :title="control.item.label"
              :aria-label="control.item.label"
              :aria-pressed="control.item.action.isActive ? isActionActive(control) : undefined"
              role="menuitem"
              @mousedown.prevent
              @click="runControl(control, true)"
            >
              <span :class="control.item.icon" aria-hidden="true" />
            </NButton>

            <component
              :is="control.component"
              v-else
              :ref="
                (value: unknown) =>
                  setComponentSurface(getRichTextQuickbarControlKey(control), value)
              "
              v-bind="control.props"
              :editor="editor"
              :disabled="disabled"
              @close="emit('close', $event)"
            />
          </template>
        </div>
      </NPopover>
    </div>
  </div>
</template>
