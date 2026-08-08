<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton } from 'naive-ui'
import { canRunRichTextAction, runRichTextAction } from '../../../client/editor/action'
import type { RichTextQuickBarActionControl, RichTextQuickBarControls } from '.'

const props = defineProps<{
  editor: Editor
  controls: RichTextQuickBarControls
}>()

const editor = props.editor

function isActionDisabled(control: RichTextQuickBarActionControl) {
  return !canRunRichTextAction(editor, control.item.action)
}

function isActionActive(control: RichTextQuickBarActionControl) {
  return control.item.action.isActive?.(editor) ?? false
}
</script>

<template>
  <div class="flex items-center gap-1">
    <template v-for="control in controls" :key="control.key">
      <NButton
        v-if="control.type === 'action'"
        :data-rich-text-toolbar-item="control.item.action.key"
        :data-test="`rich-text-quick-bar-${control.item.action.key}`"
        :disabled="isActionDisabled(control)"
        size="small"
        style="--n-padding: 0 6px"
        :type="isActionActive(control) ? 'primary' : 'default'"
        :secondary="isActionActive(control)"
        :quaternary="!isActionActive(control)"
        :title="control.item.label"
        :aria-label="control.item.label"
        :aria-pressed="control.item.action.isActive ? isActionActive(control) : undefined"
        @click="runRichTextAction(editor, control.item.action)"
      >
        <span :class="control.item.icon" aria-hidden="true" />
      </NButton>

      <component :is="control.component" v-else v-bind="control.props" :editor="editor" />
    </template>
  </div>
</template>
