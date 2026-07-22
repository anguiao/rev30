<script setup lang="ts">
import { useStyleTag } from '@vueuse/core'
import { useThemeVars } from 'naive-ui'
import { computed } from 'vue'

const themeVars = useThemeVars()

const rootTokenStyle = computed(
  () => `:root {
  --app-border-radius: ${themeVars.value.borderRadius};
  --app-primary-color: ${themeVars.value.primaryColor};
  --app-primary-color-hover: ${themeVars.value.primaryColorHover};
  --app-primary-color-pressed: ${themeVars.value.primaryColorPressed};
  --app-primary-color-suppl: ${themeVars.value.primaryColorSuppl};
}`,
)

useStyleTag(rootTokenStyle, { id: 'app-theme-tokens' })
</script>

<template>
  <slot />
</template>
