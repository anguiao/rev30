<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { computed, h } from 'vue'
import {
  getActiveRichTextCommand,
  type RichTextCommand,
  type RichTextToolbarDropdownControl,
} from './types'

const props = withDefaults(
  defineProps<{
    control: RichTextToolbarDropdownControl
    editor: Editor | null
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

function isCommandDisabled(command: RichTextCommand) {
  if (props.disabled || !props.editor) {
    return true
  }

  return command.isDisabled?.(props.editor) ?? false
}

const activeCommand = computed(() => {
  if (!props.editor) {
    return undefined
  }

  return (
    props.control.getActiveCommand?.(props.editor, props.control.commands) ??
    getActiveRichTextCommand(props.editor, props.control.commands)
  )
})

const isActive = computed(() => activeCommand.value !== undefined)

const isDisabled = computed(
  () =>
    props.disabled ||
    !props.editor ||
    props.control.commands.every((command) => isCommandDisabled(command)),
)

const triggerLabel = computed(() => activeCommand.value?.label ?? props.control.label)
const triggerIcon = computed(() => activeCommand.value?.icon ?? props.control.icon)
const buttonType = computed(() => (isActive.value ? 'primary' : 'default'))

const options = computed<DropdownOption[]>(() =>
  props.control.commands.map((command) => {
    const active = activeCommand.value?.key === command.key

    return {
      key: command.key,
      label: command.label,
      disabled: isCommandDisabled(command),
      icon: () =>
        h('span', {
          class: [command.icon, 'inline-block size-4', active ? 'text-primary' : undefined],
          'aria-hidden': 'true',
        }),
      props: {
        'data-test': `rich-text-${props.control.key}-${command.key}`,
        'data-active': active ? 'true' : undefined,
        'aria-pressed': command.isActive ? active : undefined,
      },
    }
  }),
)

function renderLabel(option: DropdownOption) {
  const active = activeCommand.value?.key === option.key

  return h('span', { class: 'flex min-w-24 items-center justify-between gap-4' }, [
    h('span', option.label as string),
    active
      ? h('span', {
          class: 'i-[lucide--check] inline-block size-4 text-primary',
          'aria-hidden': 'true',
        })
      : null,
  ])
}

function handleSelect(key: string | number) {
  if (!props.editor) {
    return
  }

  const command = props.control.commands.find((item) => item.key === key)
  if (!command || isCommandDisabled(command)) {
    return
  }

  command.run(props.editor)
}
</script>

<template>
  <NDropdown
    trigger="click"
    placement="bottom-start"
    :options="options"
    :render-label="renderLabel"
    @select="handleSelect"
  >
    <NButton
      :data-test="`rich-text-${control.key}`"
      :data-active="isActive ? 'true' : undefined"
      :disabled="isDisabled"
      size="small"
      style="--n-padding: 0 6px"
      :type="buttonType"
      :secondary="isActive"
      :quaternary="!isActive"
      :title="triggerLabel"
      :aria-label="triggerLabel"
      :aria-pressed="isActive"
    >
      <span :class="triggerIcon" aria-hidden="true" />
      <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
    </NButton>
  </NDropdown>
</template>
