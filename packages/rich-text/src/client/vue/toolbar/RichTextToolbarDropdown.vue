<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { computed, h } from 'vue'
import {
  canRunRichTextAction,
  runRichTextAction,
  type RichTextActionItem,
} from '../../../client/editor/action'
import { useRichTextDropdownTrigger } from '../interactions/dropdown'
import type { RichTextToolbarDropdownControl } from '.'

const props = withDefaults(
  defineProps<{
    control: RichTextToolbarDropdownControl
    editor: Editor
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const editor = props.editor

function isItemDisabled(item: RichTextActionItem) {
  return props.disabled || !canRunRichTextAction(editor, item.action)
}

const activeItem = computed(
  () =>
    props.control.getActiveItem?.(editor, props.control.items) ??
    props.control.items.find((item) => item.action.isActive?.(editor)),
)

const isActive = computed(() => activeItem.value !== undefined)

const isDisabled = computed(() => props.control.items.every((item) => isItemDisabled(item)))
const { show, handleTriggerKeydown } = useRichTextDropdownTrigger(isDisabled)

const triggerLabel = computed(() => activeItem.value?.label ?? props.control.label)
const triggerIcon = computed(() => activeItem.value?.icon ?? props.control.icon)

const options = computed<DropdownOption[]>(() =>
  props.control.items.map((item) => {
    const active = activeItem.value?.action.key === item.action.key

    return {
      key: item.action.key,
      label: item.label,
      disabled: isItemDisabled(item),
      icon: () =>
        h('span', {
          class: [
            item.icon,
            'inline-block size-4',
            active ? 'text-(--rich-text-theme-primary-color)' : undefined,
          ],
          'aria-hidden': 'true',
        }),
      props: {
        'data-test': `rich-text-${props.control.key}-${item.action.key}`,
        role: 'menuitem',
        'aria-pressed': item.action.isActive ? active : undefined,
        'aria-disabled': isItemDisabled(item) ? 'true' : undefined,
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
          class: 'i-[lucide--check] inline-block size-4 text-(--rich-text-theme-primary-color)',
          'aria-hidden': 'true',
        })
      : null,
  ])
}

function handleSelect(key: string | number) {
  const item = props.control.items.find((item) => item.action.key === key)
  if (item) {
    runRichTextAction(editor, item.action)
  }
}
</script>

<template>
  <div class="contents">
    <NDropdown
      v-model:show="show"
      trigger="click"
      placement="bottom-start"
      :options="options"
      :to="false"
      :menu-props="() => ({ role: 'menu', 'aria-label': control.label })"
      :render-label="renderLabel"
      @select="handleSelect"
    >
      <NButton
        :data-test="`rich-text-${control.key}`"
        :data-rich-text-toolbar-item="control.key"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        :type="isActive ? 'primary' : 'default'"
        :secondary="isActive"
        :quaternary="!isActive"
        :title="triggerLabel"
        :aria-label="triggerLabel"
        :aria-pressed="isActive"
        aria-haspopup="menu"
        :aria-expanded="show"
        @keydown="handleTriggerKeydown"
      >
        <span :class="triggerIcon" aria-hidden="true" />
        <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>
  </div>
</template>
