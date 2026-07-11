<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import type {
  FontFamilyOption,
  FontSizeOption,
  LineHeightOption,
  TextColorOption,
} from '../options'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown, NPopover } from 'naive-ui'
import { computed, h } from 'vue'
import {
  setFontFamilyAction,
  setFontSizeAction,
  setLineHeightAction,
  setTextColorAction,
  unsetFontFamilyAction,
  unsetFontSizeAction,
  unsetLineHeightAction,
  unsetTextColorAction,
} from '../editor'

interface TextStyleToolbarControlProps extends RichTextToolbarControlInjectedProps {
  colors: readonly TextColorOption[]
  fontFamilies: readonly FontFamilyOption[]
  fontSizes: readonly FontSizeOption[]
  lineHeights: readonly LineHeightOption[]
}

const props = withDefaults(defineProps<TextStyleToolbarControlProps>(), {
  disabled: false,
})

const defaultFontFamilyKey = 'font-family-default'
const defaultFontSizeKey = 'font-size-default'
const defaultLineHeightKey = 'line-height-default'

const isUnavailable = computed(() => props.disabled || !props.editor)

function normalizeAttribute(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : null
}

const textStyleAttributes = computed(() => props.editor?.getAttributes('textStyle') ?? {})
const currentColor = computed(() => normalizeAttribute(textStyleAttributes.value.color))
const currentFontFamily = computed(() => normalizeAttribute(textStyleAttributes.value.fontFamily))
const currentFontSize = computed(() => normalizeAttribute(textStyleAttributes.value.fontSize))
const currentLineHeight = computed(() => normalizeAttribute(textStyleAttributes.value.lineHeight))

const currentColorOption = computed(() =>
  props.colors.find((option) => option.value.toLowerCase() === currentColor.value),
)
const currentFontFamilyOption = computed(() =>
  props.fontFamilies.find((option) => option.value.toLowerCase() === currentFontFamily.value),
)
const currentFontSizeOption = computed(() =>
  props.fontSizes.find((option) => option.value.toLowerCase() === currentFontSize.value),
)
const currentLineHeightOption = computed(() =>
  props.lineHeights.find((option) => option.value.toLowerCase() === currentLineHeight.value),
)

function canSetColor(value: TextColorOption['value']) {
  return (
    !isUnavailable.value &&
    !!props.editor &&
    (setTextColorAction.canRun?.(props.editor, value) ?? true)
  )
}

function canUnsetColor() {
  return (
    !isUnavailable.value && !!props.editor && (unsetTextColorAction.canRun?.(props.editor) ?? true)
  )
}

function canSetFontFamily(value: FontFamilyOption['value']) {
  return (
    !isUnavailable.value &&
    !!props.editor &&
    (setFontFamilyAction.canRun?.(props.editor, value) ?? true)
  )
}

function canUnsetFontFamily() {
  return (
    !isUnavailable.value && !!props.editor && (unsetFontFamilyAction.canRun?.(props.editor) ?? true)
  )
}

function canSetFontSize(value: FontSizeOption['value']) {
  return (
    !isUnavailable.value &&
    !!props.editor &&
    (setFontSizeAction.canRun?.(props.editor, value) ?? true)
  )
}

function canUnsetFontSize() {
  return (
    !isUnavailable.value && !!props.editor && (unsetFontSizeAction.canRun?.(props.editor) ?? true)
  )
}

function canSetLineHeight(value: LineHeightOption['value']) {
  return (
    !isUnavailable.value &&
    !!props.editor &&
    (setLineHeightAction.canRun?.(props.editor, value) ?? true)
  )
}

function canUnsetLineHeight() {
  return (
    !isUnavailable.value && !!props.editor && (unsetLineHeightAction.canRun?.(props.editor) ?? true)
  )
}

const isColorDisabled = computed(
  () => !canUnsetColor() && !props.colors.some((option) => canSetColor(option.value)),
)
const isFontFamilyDisabled = computed(
  () =>
    !canUnsetFontFamily() && !props.fontFamilies.some((option) => canSetFontFamily(option.value)),
)
const isFontSizeDisabled = computed(
  () => !canUnsetFontSize() && !props.fontSizes.some((option) => canSetFontSize(option.value)),
)
const isLineHeightDisabled = computed(
  () =>
    !canUnsetLineHeight() && !props.lineHeights.some((option) => canSetLineHeight(option.value)),
)

function renderSelectionIcon(selected: boolean) {
  return () =>
    h('span', {
      class: ['inline-block size-4', selected ? 'i-[lucide--check] text-primary' : undefined],
      'aria-hidden': 'true',
    })
}

const fontFamilyMenuOptions = computed<DropdownOption[]>(() => [
  {
    key: defaultFontFamilyKey,
    label: '默认',
    disabled: !canUnsetFontFamily(),
    icon: renderSelectionIcon(!currentFontFamilyOption.value),
    props: {
      'data-test': 'rich-text-font-family-default',
      'data-active': !currentFontFamilyOption.value ? 'true' : undefined,
      'aria-pressed': !currentFontFamilyOption.value,
    },
  },
  ...props.fontFamilies.map((option) => ({
    key: option.key,
    label: option.label,
    disabled: !canSetFontFamily(option.value),
    icon: renderSelectionIcon(currentFontFamilyOption.value?.key === option.key),
    props: {
      'data-test': `rich-text-font-family-${option.key}`,
      'data-active': currentFontFamilyOption.value?.key === option.key ? 'true' : undefined,
      'aria-pressed': currentFontFamilyOption.value?.key === option.key,
    },
  })),
])

const fontSizeMenuOptions = computed<DropdownOption[]>(() => [
  {
    key: defaultFontSizeKey,
    label: '默认',
    disabled: !canUnsetFontSize(),
    icon: renderSelectionIcon(!currentFontSizeOption.value),
    props: {
      'data-test': 'rich-text-font-size-default',
      'data-active': !currentFontSizeOption.value ? 'true' : undefined,
      'aria-pressed': !currentFontSizeOption.value,
    },
  },
  ...props.fontSizes.map((option) => ({
    key: option.key,
    label: option.label,
    disabled: !canSetFontSize(option.value),
    icon: renderSelectionIcon(currentFontSizeOption.value?.key === option.key),
    props: {
      'data-test': `rich-text-font-size-${option.key}`,
      'data-active': currentFontSizeOption.value?.key === option.key ? 'true' : undefined,
      'aria-pressed': currentFontSizeOption.value?.key === option.key,
    },
  })),
])

const lineHeightMenuOptions = computed<DropdownOption[]>(() => [
  {
    key: defaultLineHeightKey,
    label: '默认',
    disabled: !canUnsetLineHeight(),
    icon: renderSelectionIcon(!currentLineHeightOption.value),
    props: {
      'data-test': 'rich-text-line-height-default',
      'data-active': !currentLineHeightOption.value ? 'true' : undefined,
      'aria-pressed': !currentLineHeightOption.value,
    },
  },
  ...props.lineHeights.map((option) => ({
    key: option.key,
    label: option.label,
    disabled: !canSetLineHeight(option.value),
    icon: renderSelectionIcon(currentLineHeightOption.value?.key === option.key),
    props: {
      'data-test': `rich-text-line-height-${option.key}`,
      'data-active': currentLineHeightOption.value?.key === option.key ? 'true' : undefined,
      'aria-pressed': currentLineHeightOption.value?.key === option.key,
    },
  })),
])

const colorLabel = computed(() => `文字颜色：${currentColorOption.value?.label ?? '默认'}`)
const fontFamilyLabel = computed(() => currentFontFamilyOption.value?.label ?? '字体')
const fontFamilyTitle = computed(() => `字体：${currentFontFamilyOption.value?.label ?? '默认'}`)
const fontSizeLabel = computed(() => currentFontSizeOption.value?.label ?? '字号')
const fontSizeTitle = computed(() => `字号：${currentFontSizeOption.value?.label ?? '默认'}`)
const lineHeightLabel = computed(() => currentLineHeightOption.value?.label ?? '行高')
const lineHeightTitle = computed(() => `行高：${currentLineHeightOption.value?.label ?? '默认'}`)

function applyColor(value: TextColorOption['value']) {
  if (!canSetColor(value) || !props.editor) {
    return
  }

  setTextColorAction.run(props.editor, value)
}

function clearColor() {
  if (!canUnsetColor() || !props.editor) {
    return
  }

  unsetTextColorAction.run(props.editor)
}

function handleFontFamilySelect(key: string | number) {
  if (!props.editor) {
    return
  }

  if (key === defaultFontFamilyKey) {
    if (canUnsetFontFamily()) {
      unsetFontFamilyAction.run(props.editor)
    }
    return
  }

  const option = props.fontFamilies.find((candidate) => candidate.key === key)

  if (option && canSetFontFamily(option.value)) {
    setFontFamilyAction.run(props.editor, option.value)
  }
}

function handleFontSizeSelect(key: string | number) {
  if (!props.editor) {
    return
  }

  if (key === defaultFontSizeKey) {
    if (canUnsetFontSize()) {
      unsetFontSizeAction.run(props.editor)
    }
    return
  }

  const option = props.fontSizes.find((candidate) => candidate.key === key)

  if (option && canSetFontSize(option.value)) {
    setFontSizeAction.run(props.editor, option.value)
  }
}

function handleLineHeightSelect(key: string | number) {
  if (!props.editor) {
    return
  }

  if (key === defaultLineHeightKey) {
    if (canUnsetLineHeight()) {
      unsetLineHeightAction.run(props.editor)
    }
    return
  }

  const option = props.lineHeights.find((candidate) => candidate.key === key)

  if (option && canSetLineHeight(option.value)) {
    setLineHeightAction.run(props.editor, option.value)
  }
}
</script>

<template>
  <div class="flex items-center gap-1">
    <NPopover trigger="click" placement="bottom" :disabled="isColorDisabled">
      <template #trigger>
        <NButton
          data-test="rich-text-text-color"
          :data-active="currentColorOption ? 'true' : undefined"
          :disabled="isColorDisabled"
          size="small"
          style="--n-padding: 0 6px"
          quaternary
          :title="colorLabel"
          :aria-label="colorLabel"
          :aria-pressed="!!currentColorOption"
          @mousedown.prevent
        >
          <span class="i-[lucide--palette]" aria-hidden="true" />
          <span
            class="ml-0.5 inline-block size-2.5 rounded-sm border border-input-border"
            :style="{ backgroundColor: currentColorOption?.value ?? 'transparent' }"
            aria-hidden="true"
          />
          <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
        </NButton>
      </template>

      <div class="flex items-center gap-1">
        <NButton
          data-test="rich-text-text-color-default"
          :data-active="!currentColorOption ? 'true' : undefined"
          :disabled="!canUnsetColor()"
          size="small"
          style="--n-padding: 0 6px"
          :type="!currentColorOption ? 'primary' : 'default'"
          :secondary="!currentColorOption"
          :quaternary="!!currentColorOption"
          title="默认"
          aria-label="默认文字颜色"
          :aria-pressed="!currentColorOption"
          @mousedown.prevent
          @click="clearColor"
        >
          <span class="i-[lucide--rotate-ccw]" aria-hidden="true" />
        </NButton>

        <NButton
          v-for="color in colors"
          :key="color.key"
          :data-test="`rich-text-text-color-${color.key}`"
          :data-active="currentColorOption?.key === color.key ? 'true' : undefined"
          :disabled="!canSetColor(color.value)"
          size="small"
          style="--n-padding: 0 6px"
          :type="currentColorOption?.key === color.key ? 'primary' : 'default'"
          :secondary="currentColorOption?.key === color.key"
          :quaternary="currentColorOption?.key !== color.key"
          :title="color.label"
          :aria-label="color.label"
          :aria-pressed="currentColorOption?.key === color.key"
          @mousedown.prevent
          @click="applyColor(color.value)"
        >
          <span
            class="inline-block size-4 rounded-sm border border-input-border"
            :style="{ backgroundColor: color.value }"
            aria-hidden="true"
          />
        </NButton>
      </div>
    </NPopover>

    <NDropdown
      trigger="click"
      placement="bottom-start"
      :options="fontFamilyMenuOptions"
      :disabled="isFontFamilyDisabled"
      @select="handleFontFamilySelect"
    >
      <NButton
        data-test="rich-text-font-family"
        :data-active="currentFontFamilyOption ? 'true' : undefined"
        :disabled="isFontFamilyDisabled"
        size="small"
        style="--n-padding: 0 6px"
        quaternary
        :title="fontFamilyTitle"
        :aria-label="fontFamilyTitle"
        :aria-pressed="!!currentFontFamilyOption"
        @mousedown.prevent
      >
        <span class="i-[lucide--type]" aria-hidden="true" />
        <span class="ml-1">{{ fontFamilyLabel }}</span>
        <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>

    <NDropdown
      trigger="click"
      placement="bottom-start"
      :options="fontSizeMenuOptions"
      :disabled="isFontSizeDisabled"
      @select="handleFontSizeSelect"
    >
      <NButton
        data-test="rich-text-font-size"
        :data-active="currentFontSizeOption ? 'true' : undefined"
        :disabled="isFontSizeDisabled"
        size="small"
        style="--n-padding: 0 6px"
        quaternary
        :title="fontSizeTitle"
        :aria-label="fontSizeTitle"
        :aria-pressed="!!currentFontSizeOption"
        @mousedown.prevent
      >
        <span class="i-[lucide--a-large-small]" aria-hidden="true" />
        <span class="ml-1">{{ fontSizeLabel }}</span>
        <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>

    <NDropdown
      trigger="click"
      placement="bottom-start"
      :options="lineHeightMenuOptions"
      :disabled="isLineHeightDisabled"
      @select="handleLineHeightSelect"
    >
      <NButton
        data-test="rich-text-line-height"
        :data-active="currentLineHeightOption ? 'true' : undefined"
        :disabled="isLineHeightDisabled"
        size="small"
        style="--n-padding: 0 6px"
        quaternary
        :title="lineHeightTitle"
        :aria-label="lineHeightTitle"
        :aria-pressed="!!currentLineHeightOption"
        @mousedown.prevent
      >
        <span class="i-[lucide--move-vertical]" aria-hidden="true" />
        <span class="ml-1">{{ lineHeightLabel }}</span>
        <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>
  </div>
</template>
