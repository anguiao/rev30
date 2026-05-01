import { computed } from 'vue'
import { useColorMode } from '@vueuse/core'
import { defineStore } from 'pinia'

const THEME_STORAGE_KEY = 'theme-mode'

export const themeModeOptions = [
  {
    value: 'light',
    label: '浅色',
    description: '使用浅色主题',
    icon: 'i-[lucide--sun]',
  },
  {
    value: 'dark',
    label: '深色',
    description: '使用深色主题',
    icon: 'i-[lucide--moon]',
  },
  {
    value: 'auto',
    label: '跟随',
    description: '跟随系统外观',
    icon: 'i-[lucide--monitor]',
  },
] as const

export type ThemeMode = (typeof themeModeOptions)[number]['value']

export const useThemeStore = defineStore('theme', () => {
  const colorMode = useColorMode({
    storageKey: THEME_STORAGE_KEY,
  })
  const mode = colorMode.store
  const resolvedMode = colorMode.state
  const isDark = computed(() => resolvedMode.value === 'dark')

  function setMode(nextMode: ThemeMode) {
    mode.value = nextMode
  }

  return {
    mode,
    resolvedMode,
    isDark,
    setMode,
  }
})
