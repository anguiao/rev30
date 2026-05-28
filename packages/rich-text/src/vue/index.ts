export { default as RichTextEditor } from './RichTextEditor.vue'
export * from './presets/types'
export { useRichTextEditor } from './useRichTextEditor'
export {
  defineRichTextCommand,
  defineRichTextToolbar,
  richTextToolbarButton,
  richTextToolbarDropdown,
} from './toolbar/types'
export type {
  RichTextCommand,
  RichTextIconClass,
  RichTextToolbarConfig,
  RichTextToolbarControlConfig,
  RichTextToolbarGroup,
} from './toolbar/types'
