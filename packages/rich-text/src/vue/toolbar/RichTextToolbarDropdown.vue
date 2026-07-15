<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { computed, h } from 'vue'
import {
  getActiveRichTextToolbarItem,
  isRichTextActionDisabled,
  type RichTextToolbarItem,
  type RichTextToolbarDropdownControl,
} from '../toolbar'

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

const editor = props.editor

function isItemDisabled(item: RichTextToolbarItem) {
  if (props.disabled || !editor) {
    return true
  }

  return isRichTextActionDisabled(item.action, editor)
}

const activeItem = computed(() => {
  if (!editor) {
    return undefined
  }

  return (
    props.control.getActiveItem?.(editor, props.control.items) ??
    getActiveRichTextToolbarItem(editor, props.control.items)
  )
})

const isActive = computed(() => activeItem.value !== undefined)

const isDisabled = computed(
  () => props.disabled || !editor || props.control.items.every((item) => isItemDisabled(item)),
)

const triggerLabel = computed(() => activeItem.value?.label ?? props.control.label)
const triggerIcon = computed(() => activeItem.value?.icon ?? props.control.icon)
const buttonType = computed(() => (isActive.value ? 'primary' : 'default'))

const options = computed<DropdownOption[]>(() =>
  props.control.items.map((item) => {
    const active = activeItem.value?.action.key === item.action.key

    return {
      key: item.action.key,
      label: item.label,
      disabled: isItemDisabled(item),
      icon: () =>
        h('span', {
          class: [item.icon, 'inline-block size-4', active ? 'text-primary' : undefined],
          'aria-hidden': 'true',
        }),
      props: {
        'data-test': `rich-text-${props.control.key}-${item.action.key}`,
        'data-active': active ? 'true' : undefined,
        'aria-pressed': item.action.isActive ? active : undefined,
      },
    }
  }),
)

function renderLabel(option: DropdownOption) {
  const active = activeItem.value?.action.key === option.key

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
  if (!editor) {
    return
  }

  const item = props.control.items.find((item) => item.action.key === key)
  if (!item || isItemDisabled(item)) {
    return
  }

  item.action.run(editor)
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
