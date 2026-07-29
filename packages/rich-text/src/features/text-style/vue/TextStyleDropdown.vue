<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { computed, h } from 'vue'
import type { RichTextFeature } from '../../../core/feature'
import {
  canRunRichTextAction,
  runRichTextAction,
  type RichTextAction,
  type RichTextIconClass,
} from '../../../editor/action'
import { useRichTextDropdownTrigger } from '../../../vue/interactions/dropdown'
import type { TextStyleOption } from '../options'

interface TextStyleDropdownConfig {
  readonly key: string
  readonly label: string
  readonly icon: RichTextIconClass
  readonly attribute: 'fontFamily' | 'fontSize' | 'lineHeight'
  readonly options: readonly TextStyleOption[]
  readonly setAction: RichTextAction<RichTextFeature, string, [value: string]>
  readonly unsetAction: RichTextAction
}

const props = defineProps<{
  editor: Editor
  disabled: boolean
  config: TextStyleDropdownConfig
}>()

const editor = props.editor

function renderSelectionIcon(selected: boolean) {
  return () =>
    h('span', {
      class: [
        'inline-block size-4',
        selected ? 'i-[lucide--check] text-(--rich-text-theme-primary-color)' : undefined,
      ],
      'aria-hidden': 'true',
    })
}

const currentValue = computed(() => editor.getAttributes('textStyle')[props.config.attribute])
const currentOption = computed(() =>
  props.config.options.find((option) => option.value === currentValue.value),
)
const dropdownOptions = computed<DropdownOption[]>(() => [
  {
    key: `${props.config.key}-default`,
    label: '默认',
    disabled: !canReset.value,
    icon: renderSelectionIcon(!currentValue.value),
    props: {
      'data-test': `rich-text-${props.config.key}-default`,
      role: 'menuitem',
      'data-active': !currentValue.value ? 'true' : undefined,
      'aria-pressed': !currentValue.value,
      'aria-disabled': !canReset.value,
    },
  },
  ...props.config.options.map((option) => {
    const active = currentOption.value?.key === option.key
    const disabled =
      props.disabled || !canRunRichTextAction(editor, props.config.setAction, option.value)

    return {
      key: option.key,
      label:
        props.config.attribute === 'fontFamily'
          ? () => h('span', { style: { fontFamily: option.value } }, option.label)
          : option.label,
      disabled,
      icon: renderSelectionIcon(active),
      props: {
        'data-test': `rich-text-${props.config.key}-${option.key}`,
        role: 'menuitem',
        'data-active': active ? 'true' : undefined,
        'aria-pressed': active,
        'aria-disabled': disabled,
      },
    }
  }),
])
const triggerLabel = computed(() => currentOption.value?.label ?? props.config.label)
const triggerTitle = computed(
  () => `${props.config.label}：${currentOption.value?.label ?? '默认'}`,
)

const canReset = computed(
  () => !props.disabled && canRunRichTextAction(editor, props.config.unsetAction),
)
const isDisabled = computed(() => dropdownOptions.value.every((option) => option.disabled))
const { show, handleTriggerKeydown } = useRichTextDropdownTrigger(isDisabled)

function handleSelect(key: string | number) {
  if (key === `${props.config.key}-default`) {
    runRichTextAction(editor, props.config.unsetAction)
  } else {
    const option = props.config.options.find((candidate) => candidate.key === key)

    if (option) {
      runRichTextAction(editor, props.config.setAction, option.value)
    }
  }
}
</script>

<template>
  <div class="contents">
    <NDropdown
      v-model:show="show"
      trigger="click"
      placement="bottom-start"
      :to="false"
      :options="dropdownOptions"
      :disabled="isDisabled"
      :menu-props="() => ({ role: 'menu', 'aria-label': config.label })"
      @select="handleSelect"
    >
      <NButton
        :data-test="`rich-text-${config.key}`"
        :data-rich-text-toolbar-item="config.key"
        :data-active="currentValue ? 'true' : undefined"
        :disabled="isDisabled"
        class="justify-start! [&_.n-button\_\_content]:w-full"
        :class="config.key === 'font-family' ? 'w-24!' : 'w-18!'"
        size="small"
        style="--n-padding: 0 4px"
        quaternary
        :title="triggerTitle"
        :aria-label="triggerTitle"
        :aria-pressed="!!currentValue"
        aria-haspopup="menu"
        :aria-expanded="show"
        @keydown="handleTriggerKeydown"
      >
        <span :class="config.icon" aria-hidden="true" />
        <span class="ml-1 min-w-0 truncate">{{ triggerLabel }}</span>
        <span class="ml-auto i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>
  </div>
</template>
