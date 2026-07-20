<script setup lang="ts">
import type { RichTextFeature } from '../../../core/feature'
import {
  canRunRichTextAction,
  runRichTextAction,
  type RichTextAction,
} from '../../../editor/action'
import type { RichTextIconClass, RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import { useRichTextToolbarLayer } from '../../../vue/surface-coordinator'
import type { TextStyleOption } from '../options'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown, NPopover } from 'naive-ui'
import { computed, h, ref, watch } from 'vue'
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
  colors: readonly TextStyleOption[]
  fontFamilies: readonly TextStyleOption[]
  fontSizes: readonly TextStyleOption[]
  lineHeights: readonly TextStyleOption[]
}

const props = withDefaults(defineProps<TextStyleToolbarControlProps>(), {
  disabled: false,
})

type TextStyleAttribute = 'color' | 'fontFamily' | 'fontSize' | 'lineHeight'

const editor = props.editor
const activeLayer = ref<string | null>(null)

function closeLayer() {
  activeLayer.value = null
  toolbarLayer.release()
}

const toolbarLayer = useRichTextToolbarLayer(editor, closeLayer)

function handleLayerShow(key: string, show: boolean) {
  if (!show) {
    if (activeLayer.value === key) {
      closeLayer()
    }
    return
  }

  toolbarLayer.claim()
  activeLayer.value = key
}

function canRunAction<Args extends unknown[]>(
  action: RichTextAction<RichTextFeature, string, Args>,
  ...args: Args
) {
  return !props.disabled && canRunRichTextAction(editor, action, ...args)
}

function runAction<Args extends unknown[]>(
  action: RichTextAction<RichTextFeature, string, Args>,
  ...args: Args
) {
  if (!canRunAction(action, ...args)) {
    return false
  }

  return runRichTextAction(editor, action, ...args)
}

function runActionAndClose<Args extends unknown[]>(
  action: RichTextAction<RichTextFeature, string, Args>,
  ...args: Args
) {
  if (runAction(action, ...args)) {
    closeLayer()
  }
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
      class: ['inline-block size-4', selected ? 'i-[lucide--check] text-primary' : undefined],
      'aria-hidden': 'true',
    })
}

interface SelectControlConfig {
  readonly label: string
  readonly icon: RichTextIconClass
  readonly attribute: Exclude<TextStyleAttribute, 'color'>
  readonly options: readonly TextStyleOption[]
  readonly setAction: RichTextAction<RichTextFeature, string, [value: string]>
  readonly unsetAction: RichTextAction
}

function getSelectControlKey(attribute: SelectControlConfig['attribute']) {
  return attribute.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)
}

function selectOption(settings: SelectControlConfig, selectedKey: string | number) {
  const controlKey = getSelectControlKey(settings.attribute)

  if (selectedKey === `${controlKey}-default`) {
    runActionAndClose(settings.unsetAction)
    return
  }

  const option = settings.options.find((candidate) => candidate.key === selectedKey)

  if (option) {
    runActionAndClose(settings.setAction, option.value)
  }
}

const selectControls = computed(() => {
  const settings: SelectControlConfig[] = [
    {
      label: '字体',
      icon: 'i-[lucide--type]',
      attribute: 'fontFamily',
      options: props.fontFamilies,
      setAction: setFontFamilyAction,
      unsetAction: unsetFontFamilyAction,
    },
    {
      label: '字号',
      icon: 'i-[lucide--a-large-small]',
      attribute: 'fontSize',
      options: props.fontSizes,
      setAction: setFontSizeAction,
      unsetAction: unsetFontSizeAction,
    },
    {
      label: '行高',
      icon: 'i-[lucide--move-vertical]',
      attribute: 'lineHeight',
      options: props.lineHeights,
      setAction: setLineHeightAction,
      unsetAction: unsetLineHeightAction,
    },
  ]

  return settings.map((setting) => {
    const controlKey = getSelectControlKey(setting.attribute)
    const value = editor.getAttributes('textStyle')[setting.attribute]
    const currentOption = setting.options.find((option) => option.value === value)
    const canReset = canRunAction(setting.unsetAction)
    const options: DropdownOption[] = [
      {
        key: `${controlKey}-default`,
        label: '默认',
        disabled: !canReset,
        icon: renderSelectionIcon(!value),
        props: {
          'data-test': `rich-text-${controlKey}-default`,
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
            'data-test': `rich-text-${controlKey}-${option.key}`,
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
      key: controlKey,
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

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      closeLayer()
    }
  },
)
</script>

<template>
  <div class="flex items-center gap-1">
    <NPopover
      trigger="click"
      placement="bottom-start"
      :show="activeLayer === 'color'"
      :disabled="colorControl.isDisabled"
      @update:show="handleLayerShow('color', $event)"
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
          @mousedown.prevent
        >
          <span class="i-[lucide--palette]" aria-hidden="true" />
          <span
            class="ml-0.5 inline-block size-3 rounded-sm border border-input-border"
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
          @mousedown.prevent
          @click="runActionAndClose(unsetTextColorAction)"
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
          @mousedown.prevent
          @click="runActionAndClose(setTextColorAction, color.value)"
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
      v-for="control in selectControls"
      :key="control.key"
      trigger="click"
      :show="activeLayer === control.key"
      placement="bottom-start"
      :options="control.options"
      :disabled="control.isDisabled"
      @update:show="handleLayerShow(control.key, $event)"
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
        @mousedown.prevent
      >
        <span :class="control.icon" aria-hidden="true" />
        <span class="ml-1 min-w-0 truncate">{{ control.label }}</span>
        <span class="ml-auto i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>
  </div>
</template>
