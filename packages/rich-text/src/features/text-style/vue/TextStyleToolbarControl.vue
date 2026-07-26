<script setup lang="ts">
import type { RichTextFeature } from '../../../core/feature'
import {
  canRunRichTextAction,
  runRichTextAction,
  type RichTextAction,
} from '../../../editor/action'
import type { RichTextIconClass } from '../../../editor/action'
import type { RichTextToolbarControlProps } from '../../../vue/toolbar'
import type { TextStyleOption } from '../options'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown, NPopover } from 'naive-ui'
import { computed, h, ref } from 'vue'
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

interface TextStyleToolbarControlProps extends RichTextToolbarControlProps {
  colors: readonly TextStyleOption[]
  fontFamilies: readonly TextStyleOption[]
  fontSizes: readonly TextStyleOption[]
  lineHeights: readonly TextStyleOption[]
}

const props = withDefaults(defineProps<TextStyleToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const showColor = ref(false)

function handleEscape(event: KeyboardEvent) {
  if (!showColor.value || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  showColor.value = false
}

function canRunAction<Args extends unknown[]>(
  action: RichTextAction<RichTextFeature, string, Args>,
  ...args: Args
) {
  return !props.disabled && canRunRichTextAction(editor, action, ...args)
}

function setColor(value: string) {
  runRichTextAction(editor, setTextColorAction, value)
  showColor.value = false
}

function resetColor() {
  runRichTextAction(editor, unsetTextColorAction)
  showColor.value = false
}

const colorControl = computed(() => {
  const value = editor.getAttributes('textStyle').color
  const currentOption = props.colors.find((option) => option.value === value)
  const canReset = canRunAction(unsetTextColorAction)
  const options = props.colors.map((option) => ({
    ...option,
    active: currentOption?.key === option.key,
    disabled: !canRunAction(setTextColorAction, option.value),
  }))

  return {
    value,
    options,
    canReset,
    isDisabled: !canReset && options.every((option) => option.disabled),
    title: `文字颜色：${currentOption?.label ?? value ?? '默认'}`,
  }
})

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

interface SelectControlConfig {
  readonly key: string
  readonly label: string
  readonly icon: RichTextIconClass
  readonly attribute: 'fontFamily' | 'fontSize' | 'lineHeight'
  readonly options: readonly TextStyleOption[]
  readonly setAction: RichTextAction<RichTextFeature, string, [value: string]>
  readonly unsetAction: RichTextAction
}

function selectOption(settings: SelectControlConfig, selectedKey: string | number) {
  if (selectedKey === `${settings.key}-default`) {
    runRichTextAction(editor, settings.unsetAction)
    return
  }

  const option = settings.options.find((candidate) => candidate.key === selectedKey)

  if (option) {
    runRichTextAction(editor, settings.setAction, option.value)
  }
}

const selectControls = computed(() => {
  const settings: SelectControlConfig[] = [
    {
      key: 'font-family',
      label: '字体',
      icon: 'i-[lucide--type]',
      attribute: 'fontFamily',
      options: props.fontFamilies,
      setAction: setFontFamilyAction,
      unsetAction: unsetFontFamilyAction,
    },
    {
      key: 'font-size',
      label: '字号',
      icon: 'i-[lucide--a-large-small]',
      attribute: 'fontSize',
      options: props.fontSizes,
      setAction: setFontSizeAction,
      unsetAction: unsetFontSizeAction,
    },
    {
      key: 'line-height',
      label: '行高',
      icon: 'i-[lucide--move-vertical]',
      attribute: 'lineHeight',
      options: props.lineHeights,
      setAction: setLineHeightAction,
      unsetAction: unsetLineHeightAction,
    },
  ]

  return settings.map((setting) => {
    const value = editor.getAttributes('textStyle')[setting.attribute]
    const currentOption = setting.options.find((option) => option.value === value)
    const canReset = canRunAction(setting.unsetAction)
    const options: DropdownOption[] = [
      {
        key: `${setting.key}-default`,
        label: '默认',
        disabled: !canReset,
        icon: renderSelectionIcon(!value),
        props: {
          'data-test': `rich-text-${setting.key}-default`,
          'data-active': !value ? 'true' : undefined,
          'aria-pressed': !value,
        },
      },
      ...setting.options.map((option) => {
        const active = currentOption?.key === option.key
        const disabled = !canRunAction(setting.setAction, option.value)

        return {
          key: option.key,
          label:
            setting.attribute === 'fontFamily'
              ? () => h('span', { style: { fontFamily: option.value } }, option.label)
              : option.label,
          disabled,
          icon: renderSelectionIcon(active),
          props: {
            'data-test': `rich-text-${setting.key}-${option.key}`,
            'data-active': active ? 'true' : undefined,
            'aria-pressed': active,
          },
        }
      }),
    ]
    const isDisabled = options.every((option) => option.disabled)
    const label = currentOption?.label ?? setting.label
    const title = `${setting.label}：${currentOption?.label ?? '默认'}`

    return {
      key: setting.key,
      icon: setting.icon,
      options,
      isDisabled,
      value,
      label,
      title,
      select: (key: string | number) => selectOption(setting, key),
    }
  })
})
</script>

<template>
  <div class="flex items-center gap-1" @keydown.capture="handleEscape">
    <NPopover
      v-model:show="showColor"
      trigger="click"
      placement="bottom-start"
      :to="false"
      :disabled="colorControl.isDisabled"
    >
      <template #trigger>
        <NButton
          data-test="rich-text-text-color"
          :data-active="colorControl.value ? 'true' : undefined"
          :disabled="colorControl.isDisabled"
          class="justify-start!"
          size="small"
          style="--n-padding: 0 6px"
          quaternary
          :title="colorControl.title"
          :aria-label="colorControl.title"
          :aria-pressed="!!colorControl.value"
        >
          <span class="i-[lucide--palette]" aria-hidden="true" />
          <span
            class="ml-0.5 inline-block size-3 rounded-sm border border-(--rich-text-theme-input-border-color)"
            :style="{ backgroundColor: colorControl.value ?? 'currentColor' }"
            aria-hidden="true"
          />
          <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
        </NButton>
      </template>

      <div class="grid grid-cols-5 gap-1" role="group" aria-label="文字颜色">
        <NButton
          data-test="rich-text-text-color-default"
          :data-active="!colorControl.value ? 'true' : undefined"
          :disabled="!colorControl.canReset"
          size="small"
          style="--n-padding: 0 6px"
          :type="!colorControl.value ? 'primary' : 'default'"
          :secondary="!colorControl.value"
          :quaternary="!!colorControl.value"
          title="默认文字颜色"
          aria-label="默认文字颜色"
          :aria-pressed="!colorControl.value"
          @click="resetColor"
        >
          <span class="i-[lucide--rotate-ccw]" aria-hidden="true" />
        </NButton>

        <NButton
          v-for="color in colorControl.options"
          :key="color.key"
          :data-test="`rich-text-text-color-${color.key}`"
          :data-active="color.active ? 'true' : undefined"
          :disabled="color.disabled"
          size="small"
          style="--n-padding: 0 6px"
          :type="color.active ? 'primary' : 'default'"
          :secondary="color.active"
          :quaternary="!color.active"
          :title="color.label"
          :aria-label="color.label"
          :aria-pressed="color.active"
          @click="setColor(color.value)"
        >
          <span
            class="inline-block size-4 rounded-sm border border-(--rich-text-theme-input-border-color)"
            :style="{ backgroundColor: color.value }"
            aria-hidden="true"
          />
        </NButton>
      </div>
    </NPopover>

    <NDropdown
      v-for="control in selectControls"
      :key="control.key"
      trigger="click"
      placement="bottom-start"
      :to="false"
      :options="control.options"
      :disabled="control.isDisabled"
      @select="control.select"
    >
      <NButton
        :data-test="`rich-text-${control.key}`"
        :data-active="control.value ? 'true' : undefined"
        :disabled="control.isDisabled"
        class="justify-start! [&_.n-button\_\_content]:w-full"
        :class="control.key === 'font-family' ? 'w-24!' : 'w-18!'"
        size="small"
        style="--n-padding: 0 4px"
        quaternary
        :title="control.title"
        :aria-label="control.title"
        :aria-pressed="!!control.value"
      >
        <span :class="control.icon" aria-hidden="true" />
        <span class="ml-1 min-w-0 truncate">{{ control.label }}</span>
        <span class="ml-auto i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>
  </div>
</template>
