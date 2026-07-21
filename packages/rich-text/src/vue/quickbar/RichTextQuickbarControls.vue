<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { NButton, NPopover } from 'naive-ui'
import { computed, nextTick, ref } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../editor/action'
import {
  getRichTextQuickbarControlKey,
  getRichTextQuickbarLayerId,
  type RichTextQuickbarControl,
  type RichTextQuickbarControlsConfig,
} from '../quickbar'
import { type RichTextOverlayCloseReason, useRichTextOverlayState } from '../overlay-state'

interface QuickbarComponentSurface {
  close?: (reason: RichTextOverlayCloseReason) => void
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
const overlayState = useRichTextOverlayState()
const layerId = getRichTextQuickbarLayerId(editor)
const moreTrigger = ref<HTMLElement | null>(null)
const moreMenu = ref<HTMLElement | null>(null)
const showMore = ref(false)
const componentSurfaces = new Map<string, QuickbarComponentSurface>()

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

function handleMoreKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  closeMore(true)
}

defineExpose({
  close: (reason: RichTextOverlayCloseReason = 'outside') => {
    for (const surface of componentSurfaces.values()) {
      surface.close?.(reason)
    }
    closeMore(false)
  },
})
</script>

<template>
  <div class="flex items-center gap-1">
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
        :to="overlayState.target.value"
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
