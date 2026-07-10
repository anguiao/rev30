<script setup lang="ts">
import { useQueryCache } from '@pinia/colada'
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  darkTheme,
  dateZhCN,
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NMessageProvider,
  zhCN,
} from 'naive-ui'
import ThemeTokenProvider from './components/common/ThemeTokenProvider.vue'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'

const theme = useThemeStore()
const naiveTheme = computed(() => (theme.isDark ? darkTheme : null))

const router = useRouter()
const queryCache = useQueryCache()
const auth = useAuthStore()

watch(
  () => auth.isAuthenticated,
  (isAuthenticated, wasAuthenticated) => {
    if (isAuthenticated || !wasAuthenticated) return

    queryCache.cancelQueries()
    queryCache.getEntries().forEach((entry) => queryCache.remove(entry))
    void router.replace('/login')
  },
)
</script>

<template>
  <NConfigProvider :date-locale="dateZhCN" :locale="zhCN" :theme="naiveTheme">
    <NDialogProvider>
      <NMessageProvider>
        <NGlobalStyle />
        <ThemeTokenProvider>
          <RouterView />
        </ThemeTokenProvider>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>
