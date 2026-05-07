<script setup lang="ts">
import { computed, h } from 'vue'
import { NDropdown } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { type ThemeMode, themeModeOptions, useThemeStore } from '../../stores/theme'

withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

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
    <button
      data-test="theme-mode-trigger"
      type="button"
      :aria-label="`主题模式：${currentThemeOption.label}`"
      class="flex items-center rounded-md py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      :class="compact ? 'justify-center px-2' : 'gap-1.5 px-2'"
    >
      <span
        data-test="theme-mode-trigger-icon"
        class="inline-block size-3.5 shrink-0"
        :class="currentThemeOption.icon"
        aria-hidden="true"
      />
      <span v-if="!compact" class="hidden sm:inline-block">{{ currentThemeOption.label }}</span>
      <span
        v-if="!compact"
        class="i-[lucide--chevron-down] inline-block size-3.5 shrink-0 opacity-50"
        aria-hidden="true"
      />
    </button>
  </NDropdown>
</template>
