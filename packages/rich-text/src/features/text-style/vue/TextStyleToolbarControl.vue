<script setup lang="ts">
import type { RichTextToolbarControlProps } from '../../../vue/toolbar'
import {
  setFontFamilyAction,
  setFontSizeAction,
  setLineHeightAction,
  unsetFontFamilyAction,
  unsetFontSizeAction,
  unsetLineHeightAction,
} from '../editor'
import type { TextStyleOption } from '../options'
import TextStyleColorControl from './TextStyleColorControl.vue'
import TextStyleDropdown from './TextStyleDropdown.vue'

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

const dropdowns = [
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
] as const
</script>

<template>
  <div class="flex items-center gap-1">
    <TextStyleColorControl :editor="editor" :colors="colors" :disabled="disabled" />

    <TextStyleDropdown
      v-for="dropdown in dropdowns"
      :key="dropdown.key"
      :editor="editor"
      :disabled="disabled"
      :config="dropdown"
    />
  </div>
</template>
