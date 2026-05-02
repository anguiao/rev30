<script setup lang="ts">
import { computed, h } from 'vue'
import { NButton, NDropdown } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { type ThemeMode, themeModeOptions, useThemeStore } from '../../stores/theme'

const theme = useThemeStore()
const { mode } = storeToRefs(theme)
const dropdownOptions = themeModeOptions.map((option) => ({
  key: option.value,
  label: option.label,
  icon: () =>
    h('span', {
      class: [option.icon, 'inline-block size-4'],
      'aria-hidden': 'true',
    }),
  props: {
    'data-test': `theme-mode-option-${option.value}`,
    'aria-label': option.description,
  },
}))

const currentThemeOption = computed(
  () => themeModeOptions.find((option) => option.value === mode.value) ?? themeModeOptions[2]!,
)

function handleSelect(value: string | number) {
  theme.setMode(value as ThemeMode)
}
</script>

<template>
  <NDropdown
    trigger="click"
    placement="bottom-end"
    :options="dropdownOptions"
    @select="handleSelect"
  >
    <NButton
      data-test="theme-mode-trigger"
      size="small"
      secondary
      :aria-label="`主题模式：${currentThemeOption.label}`"
    >
      <span
        data-test="theme-mode-trigger-icon"
        class="inline-block size-4 shrink-0"
        :class="currentThemeOption.icon"
        aria-hidden="true"
      />
      <span class="ml-1.5">{{ currentThemeOption.label }}</span>
      <span
        class="ml-1 i-[lucide--chevron-down] inline-block size-3.5 shrink-0"
        aria-hidden="true"
      />
    </NButton>
  </NDropdown>
</template>
