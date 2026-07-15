import { defineRichTextFeature } from '../../core/feature'

export const richTextCodeBlockBackground = 'light-dark(#f5f5f4, #09090b)'
export const richTextCodeBlockStyle = `background-color: ${richTextCodeBlockBackground}`
export const richTextCodeBlockCodeStyle = 'padding: 0; background: transparent'

export const codeBlockFeature = defineRichTextFeature({
  key: 'code-block',
  editorImplementation: true,
  serverImplementation: true,
})
