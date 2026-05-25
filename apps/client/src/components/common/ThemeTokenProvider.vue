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
  --app-input-border-hover-color: ${themeVars.value.primaryColorHover};
  --app-input-border-focus-color: ${themeVars.value.primaryColorHover};
  --app-input-box-shadow-focus: 0 0 0 2px color-mix(in srgb, ${themeVars.value.primaryColor} 20%, transparent);
}

.dark {
  --app-input-box-shadow-focus: 0 0 8px 0 color-mix(in srgb, ${themeVars.value.primaryColor} 30%, transparent);
}`,
)

useStyleTag(rootTokenStyle, { id: 'app-theme-tokens' })
</script>

<template>
  <slot />
</template>
