<script setup lang="ts">
import { computed } from 'vue'
import { darkTheme, NConfigProvider, NGlobalStyle } from 'naive-ui'
import { useThemeStore } from './stores/theme'

const theme = useThemeStore()
const naiveTheme = computed(() => (theme.isDark ? darkTheme : null))
</script>

<template>
  <n-config-provider :theme="naiveTheme">
    <NGlobalStyle />
    <RouterView />
  </n-config-provider>
</template>
