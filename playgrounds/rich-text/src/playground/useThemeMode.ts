import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'rev30-rich-text-playground-theme'

export const themeModeOptions: Array<{ label: string; value: ThemeMode }> = [
  { label: '亮色', value: 'light' },
  { label: '暗色', value: 'dark' },
  { label: '跟随系统', value: 'system' },
]

function readStoredMode(): ThemeMode {
  const storedMode = localStorage.getItem(THEME_STORAGE_KEY)

  return storedMode === 'light' || storedMode === 'dark' || storedMode === 'system'
    ? storedMode
    : 'system'
}

export function useThemeMode(): {
  mode: Ref<ThemeMode>
  resolvedMode: ComputedRef<'light' | 'dark'>
  isDark: ComputedRef<boolean>
  setMode: (mode: ThemeMode) => void
} {
  const mode = ref<ThemeMode>(readStoredMode())
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const prefersDark = ref(mediaQuery.matches)
  const resolvedMode = computed(() =>
    mode.value === 'system' ? (prefersDark.value ? 'dark' : 'light') : mode.value,
  )
  const isDark = computed(() => resolvedMode.value === 'dark')

  function handleSystemThemeChange(event: MediaQueryListEvent) {
    prefersDark.value = event.matches
  }

  let listeningToSystemTheme = false

  function syncSystemThemeListener(nextMode: ThemeMode) {
    if (nextMode === 'system' && !listeningToSystemTheme) {
      prefersDark.value = mediaQuery.matches
      mediaQuery.addEventListener('change', handleSystemThemeChange)
      listeningToSystemTheme = true
      return
    }

    if (nextMode !== 'system' && listeningToSystemTheme) {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
      listeningToSystemTheme = false
    }
  }

  function setMode(nextMode: ThemeMode) {
    mode.value = nextMode
    localStorage.setItem(THEME_STORAGE_KEY, nextMode)
  }

  watch(
    resolvedMode,
    (nextMode) => {
      document.documentElement.classList.toggle('dark', nextMode === 'dark')
    },
    { immediate: true },
  )

  watch(mode, syncSystemThemeListener, { immediate: true })

  onUnmounted(() => {
    if (listeningToSystemTheme) {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }
  })

  return { mode, resolvedMode, isDark, setMode }
}
