<script setup lang="ts">
import { computed } from 'vue'
import { useThemeVars } from 'naive-ui'

const themeVars = useThemeVars()

const style = computed(() => ({
  '--app-border-radius': themeVars.value.borderRadius,
  '--app-primary-color': themeVars.value.primaryColor,
  '--app-primary-color-hover': themeVars.value.primaryColorHover,
  '--app-primary-color-pressed': themeVars.value.primaryColorPressed,
  '--app-primary-color-suppl': themeVars.value.primaryColorSuppl,
}))
</script>

<template>
  <div class="contents" :style="style">
    <slot />
  </div>
</template>
