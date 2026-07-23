import { useThemeVars } from 'naive-ui'
import { computed } from 'vue'
import './theme.css'

export function useRichTextThemeStyle() {
  const themeVars = useThemeVars()

  return computed(() => ({
    '--rich-text-default-border-radius': themeVars.value.borderRadius,
    '--rich-text-default-primary-color': themeVars.value.primaryColor,
    '--rich-text-default-primary-color-hover': themeVars.value.primaryColorHover,
    '--rich-text-default-popover-color': themeVars.value.popoverColor,
    '--rich-text-default-input-color': themeVars.value.inputColor,
    '--rich-text-default-input-focus-color': themeVars.value.inputColor,
    '--rich-text-default-input-border-color': themeVars.value.borderColor,
    '--rich-text-default-input-border-hover-color': themeVars.value.primaryColorHover,
    '--rich-text-default-input-border-focus-color': themeVars.value.primaryColorHover,
    '--rich-text-default-input-divider-color': themeVars.value.dividerColor,
    '--rich-text-default-input-box-shadow-focus': `0 0 0 2px color-mix(in srgb, ${themeVars.value.primaryColor} 20%, transparent)`,
    '--rich-text-default-muted-text-color': themeVars.value.textColor3,
  }))
}
