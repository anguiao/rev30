<script setup lang="ts">
import { computed } from 'vue'
import { darkTheme, dateZhCN, NConfigProvider, NGlobalStyle, zhCN } from 'naive-ui'
import ThemeTokenProvider from './components/common/ThemeTokenProvider.vue'
import { useThemeStore } from './stores/theme'

const theme = useThemeStore()
const naiveTheme = computed(() => (theme.isDark ? darkTheme : null))
</script>

<template>
  <NConfigProvider :date-locale="dateZhCN" :locale="zhCN" :theme="naiveTheme">
    <NGlobalStyle />
    <ThemeTokenProvider>
      <RouterView />
    </ThemeTokenProvider>
  </NConfigProvider>
</template>
