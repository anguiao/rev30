<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { NButton, NPopover } from 'naive-ui'
import { computed, nextTick, ref } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../editor/action'
import type { RichTextQuickBarActionControl, RichTextQuickBarControls } from '.'

const props = defineProps<{
  editor: Editor
  controls: RichTextQuickBarControls
}>()

const emit = defineEmits<{
  close: []
}>()

const editor = props.editor

const showMore = ref(false)
const moreTrigger = ref<HTMLElement | null>(null)

const mainControls = computed(() => props.controls.main)
const moreControls = computed(() => props.controls.more)

function isActionDisabled(control: RichTextQuickBarActionControl) {
  return !canRunRichTextAction(editor, control.item.action)
}

function isActionActive(control: RichTextQuickBarActionControl) {
  return control.item.action.isActive?.(editor) ?? false
}

function runControl(control: RichTextQuickBarActionControl) {
  runRichTextAction(editor, control.item.action)
}

function runMoreControl(control: RichTextQuickBarActionControl) {
  runControl(control)
  showMore.value = false
}

function handleMoreKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  showMore.value = false
  void nextTick(() => moreTrigger.value?.querySelector<HTMLElement>('button')?.focus())
}
</script>

<template>
  <div class="flex items-center gap-1">
    <div v-for="control in mainControls" :key="control.key">
      <NButton
        v-if="control.type === 'action'"
        data-rich-text-quick-bar-roving
        :data-test="`rich-text-quick-bar-${control.item.action.key}`"
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
        v-bind="control.props"
        :editor="editor"
        @close="emit('close')"
      />
    </div>

    <div v-if="moreControls.length > 0" ref="moreTrigger">
      <NPopover
        :show="showMore"
        trigger="manual"
        placement="bottom-start"
        :to="false"
        @clickoutside="showMore = false"
      >
        <template #trigger>
          <NButton
            data-test="rich-text-quick-bar-more"
            data-rich-text-quick-bar-roving
            :data-active="showMore ? 'true' : undefined"
            size="small"
            style="--n-padding: 0 6px"
            quaternary
            title="更多"
            aria-label="更多"
            aria-haspopup="menu"
            :aria-expanded="showMore"
            @mousedown.prevent
            @click="showMore = !showMore"
          >
            <span class="i-[lucide--ellipsis]" aria-hidden="true" />
          </NButton>
        </template>

        <div
          class="flex items-center gap-1"
          role="menu"
          aria-label="更多格式"
          @keydown="handleMoreKeydown"
        >
          <template v-for="control in moreControls" :key="control.key">
            <NButton
              v-if="control.type === 'action'"
              :data-test="`rich-text-quick-bar-more-${control.item.action.key}`"
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
              @click="runMoreControl(control)"
            >
              <span :class="control.item.icon" aria-hidden="true" />
            </NButton>

            <component
              :is="control.component"
              v-else
              v-bind="control.props"
              :editor="editor"
              @close="emit('close')"
            />
          </template>
        </div>
      </NPopover>
    </div>
  </div>
</template>
