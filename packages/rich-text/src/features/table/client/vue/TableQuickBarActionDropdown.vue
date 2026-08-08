<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { computed } from 'vue'
import { runRichTextAction, type RichTextActionItem } from '../../../../client/editor/action'
import { useRichTextDropdownTrigger } from '../../../../client/vue/interactions/dropdown'
import { createTableDropdownOption, type TableDropdownOption } from './dropdown'

const props = defineProps<{
  editor: Editor
  items: readonly RichTextActionItem[]
  triggerKey: string
  triggerLabel: string
  triggerIcon: string
}>()

const editor = props.editor

const options = computed(() => props.items.map((item) => createTableDropdownOption(editor, item)))

const isDisabled = computed(() => options.value.every((option) => option.disabled))
const { show, handleTriggerKeydown } = useRichTextDropdownTrigger(isDisabled)

function handleSelect(_key: string | number, option: DropdownOption) {
  runRichTextAction(editor, (option as TableDropdownOption).action)
}
</script>

<template>
  <NDropdown
    v-model:show="show"
    trigger="click"
    placement="bottom-start"
    :options="options"
    :disabled="isDisabled"
    :to="false"
    :menu-props="
      () => ({
        role: 'menu',
        'aria-label': `${triggerLabel}操作`,
      })
    "
    @select="handleSelect"
  >
    <NButton
      :data-test="`rich-text-quick-bar-${triggerKey}`"
      :data-rich-text-toolbar-item="triggerKey"
      :disabled="isDisabled"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      :title="triggerLabel"
      :aria-label="`${triggerLabel}操作`"
      aria-haspopup="menu"
      :aria-expanded="show"
      @keydown="handleTriggerKeydown"
    >
      <span :class="[triggerIcon, 'size-4']" aria-hidden="true" />
      <span class="ml-1 text-xs">{{ triggerLabel }}</span>
      <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
    </NButton>
  </NDropdown>
</template>
